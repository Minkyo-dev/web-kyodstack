import "server-only";
import { randomUUID } from "node:crypto";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import type { Transaction } from "../domain/finance.types";
import type { CreateTransactionInput, UpdateTransactionInput } from "../schemas/finance.schema";
import { listTransactionsByDate } from "../queries/finance.queries";
import { householdMemberIds, requireHousehold } from "./household.service";

type Existing = Pick<Transaction, "account_id" | "transfer_account_id" | "category_id" | "type" | "transfer_group_id">;

type References = {
  accounts: Map<string, { is_active: boolean; currency_code: string }>;
  categories: Map<string, { type: string; is_active: boolean }>;
  members: Set<string>;
};

/** Loads, in three queries, every account, category and member a set of inputs refers to (household-scoped). */
async function loadReferences(ctx: ActionContext, householdId: string, inputs: CreateTransactionInput[]): Promise<References> {
  const accountIds = [...new Set(inputs.flatMap((i) => [i.accountId, ...(i.type === "TRANSFER" && i.transferAccountId ? [i.transferAccountId] : [])]))];
  const categoryIds = [...new Set(inputs.flatMap((i) => (i.type !== "TRANSFER" && i.categoryId ? [i.categoryId] : [])))];
  const [accounts, categories, members] = await Promise.all([
    ctx.supabase.from("finance_accounts").select("id, is_active, currency_code").eq("household_id", householdId).in("id", accountIds),
    categoryIds.length
      ? ctx.supabase.from("finance_categories").select("id, type, is_active").eq("household_id", householdId).in("id", categoryIds)
      : Promise.resolve({ data: [], error: null }),
    inputs.some((i) => i.paidByUserId) ? householdMemberIds(ctx, householdId) : Promise.resolve(new Set<string>()),
  ]);
  if (accounts.error) throw fromDbError(accounts.error);
  if (categories.error) throw fromDbError(categories.error);
  return {
    accounts: new Map(accounts.data.map((a) => [a.id, a])),
    categories: new Map(categories.data.map((c) => [c.id, c])),
    members,
  };
}

/**
 * Spec §34: account, transfer target, category and payer must all belong to the caller's household. Archived (or
 * deleted, ADR 0027) accounts and categories are rejected for new entries but a transaction may keep the one it
 * already has. Returns the account's currency.
 */
function checkReferences(refs: References, input: CreateTransactionInput, existing: Existing | null, at = ""): string {
  const accountIds = [input.accountId, ...(input.type === "TRANSFER" && input.transferAccountId ? [input.transferAccountId] : [])];
  const kept = new Set([existing?.account_id, existing?.transfer_account_id].filter(Boolean));
  for (const id of accountIds) {
    const account = refs.accounts.get(id);
    if (!account) throw new AppError("VALIDATION_ERROR", `${at}계좌를 찾을 수 없습니다.`);
    if (!account.is_active && !kept.has(id)) throw new AppError("VALIDATION_ERROR", `${at}보관된 계좌에는 새 거래를 기록할 수 없습니다.`);
  }

  if (input.type !== "TRANSFER" && input.categoryId) {
    const category = refs.categories.get(input.categoryId);
    if (!category) throw new AppError("VALIDATION_ERROR", `${at}카테고리를 찾을 수 없습니다.`);
    if (category.type !== input.type) throw new AppError("VALIDATION_ERROR", `${at}거래 종류와 카테고리 종류가 다릅니다.`);
    if (!category.is_active && existing?.category_id !== input.categoryId) {
      throw new AppError("VALIDATION_ERROR", `${at}보관된 카테고리는 새로 선택할 수 없습니다.`);
    }
  }

  if (input.paidByUserId && !refs.members.has(input.paidByUserId)) {
    throw new AppError("VALIDATION_ERROR", `${at}결제한 사람은 가계 구성원이어야 합니다.`);
  }

  return refs.accounts.get(input.accountId)!.currency_code;
}

async function validateReferences(
  ctx: ActionContext,
  householdId: string,
  input: CreateTransactionInput,
  existing: Existing | null,
): Promise<{ currency: string }> {
  const refs = await loadReferences(ctx, householdId, [input]);
  return { currency: checkReferences(refs, input, existing) };
}

function toRow(input: CreateTransactionInput, currency: string, transferGroupId: string | null) {
  const transfer = input.type === "TRANSFER";
  return {
    type: input.type,
    amount: input.amount,
    account_id: input.accountId,
    transfer_account_id: transfer ? input.transferAccountId : null,
    transfer_group_id: transfer ? (transferGroupId ?? randomUUID()) : null,
    category_id: transfer ? null : input.categoryId,
    currency_code: currency,
    transaction_date: input.date,
    transaction_time: input.time,
    merchant_name: input.merchantName,
    paid_by_user_id: input.paidByUserId,
    note: input.note,
  };
}

export async function createTransaction(ctx: ActionContext, input: CreateTransactionInput): Promise<Transaction> {
  const { householdId } = await requireHousehold(ctx);
  const { currency } = await validateReferences(ctx, householdId, input, null);
  const { data, error } = await ctx.supabase
    .from("finance_transactions")
    .insert({
      ...toRow(input, currency, null),
      household_id: householdId,
      created_by_user_id: ctx.user.id,
      source: "MANUAL",
    })
    .select()
    .single();
  if (error) throw fromDbError(error);
  return data;
}

/** Bulk entry (ADR 0027): one multi-row insert, so every row is saved or none is. Errors name the row (1-based). */
export async function createTransactions(ctx: ActionContext, inputs: CreateTransactionInput[]): Promise<{ count: number }> {
  const { householdId } = await requireHousehold(ctx);
  const refs = await loadReferences(ctx, householdId, inputs);
  const rows = inputs.map((input, i) => ({
    ...toRow(input, checkReferences(refs, input, null, `${i + 1}행: `), null),
    household_id: householdId,
    created_by_user_id: ctx.user.id,
    source: "MANUAL",
  }));
  const { error, count } = await ctx.supabase.from("finance_transactions").insert(rows, { count: "exact" });
  if (error) throw fromDbError(error);
  return { count: count ?? rows.length };
}

export async function updateTransaction(ctx: ActionContext, input: UpdateTransactionInput): Promise<Transaction> {
  const { householdId } = await requireHousehold(ctx);
  const before = await ctx.supabase
    .from("finance_transactions")
    .select("account_id, transfer_account_id, category_id, type, transfer_group_id")
    .eq("id", input.transactionId)
    .eq("household_id", householdId)
    .maybeSingle();
  if (before.error) throw fromDbError(before.error);
  if (!before.data) throw new AppError("NOT_FOUND");
  const { currency } = await validateReferences(ctx, householdId, input, before.data);
  // updated_by is stamped by the database trigger; created_by never changes.
  const { data, error } = await ctx.supabase
    .from("finance_transactions")
    .update(toRow(input, currency, before.data.transfer_group_id))
    .eq("id", input.transactionId)
    .eq("household_id", householdId)
    .select()
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new AppError("NOT_FOUND");
  return data;
}

export async function deleteTransaction(ctx: ActionContext, transactionId: string): Promise<void> {
  const { householdId } = await requireHousehold(ctx);
  const { data, error } = await ctx.supabase
    .from("finance_transactions")
    .delete()
    .eq("id", transactionId)
    .eq("household_id", householdId)
    .select("id")
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new AppError("NOT_FOUND");
}

/** Spec §28: the calendar loads daily totals; a day's rows are fetched only when the day is opened. */
export async function getTransactionsByDate(ctx: ActionContext, date: string): Promise<Transaction[]> {
  const { householdId } = await requireHousehold(ctx);
  return listTransactionsByDate(ctx.supabase, householdId, date);
}
