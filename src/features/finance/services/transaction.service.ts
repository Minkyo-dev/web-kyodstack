import "server-only";
import { randomUUID } from "node:crypto";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import type { Transaction } from "../domain/finance.types";
import type { CreateTransactionInput, UpdateTransactionInput } from "../schemas/finance.schema";
import { listTransactionsByDate } from "../queries/finance.queries";
import { householdMemberIds, requireHousehold } from "./household.service";

type Existing = Pick<Transaction, "account_id" | "transfer_account_id" | "category_id" | "type" | "transfer_group_id">;

/**
 * Spec §34: account, transfer target, category and payer must all belong to the caller's household. Archived accounts
 * and categories are rejected for new entries but a transaction may keep the one it already has.
 */
async function validateReferences(
  ctx: ActionContext,
  householdId: string,
  input: CreateTransactionInput,
  existing: Existing | null,
): Promise<{ currency: string }> {
  const accountIds = [input.accountId, ...(input.type === "TRANSFER" && input.transferAccountId ? [input.transferAccountId] : [])];
  const accounts = await ctx.supabase
    .from("finance_accounts")
    .select("id, is_active, currency_code")
    .eq("household_id", householdId)
    .in("id", accountIds);
  if (accounts.error) throw fromDbError(accounts.error);
  const kept = new Set([existing?.account_id, existing?.transfer_account_id].filter(Boolean));
  for (const id of accountIds) {
    const account = accounts.data.find((a) => a.id === id);
    if (!account) throw new AppError("VALIDATION_ERROR", "계좌를 찾을 수 없습니다.");
    if (!account.is_active && !kept.has(id)) throw new AppError("VALIDATION_ERROR", "보관된 계좌에는 새 거래를 기록할 수 없습니다.");
  }

  if (input.type !== "TRANSFER" && input.categoryId) {
    const category = await ctx.supabase
      .from("finance_categories")
      .select("type, is_active")
      .eq("household_id", householdId)
      .eq("id", input.categoryId)
      .maybeSingle();
    if (category.error) throw fromDbError(category.error);
    if (!category.data) throw new AppError("VALIDATION_ERROR", "카테고리를 찾을 수 없습니다.");
    if (category.data.type !== input.type) throw new AppError("VALIDATION_ERROR", "거래 종류와 카테고리 종류가 다릅니다.");
    if (!category.data.is_active && existing?.category_id !== input.categoryId) {
      throw new AppError("VALIDATION_ERROR", "보관된 카테고리는 새로 선택할 수 없습니다.");
    }
  }

  if (input.paidByUserId) {
    const members = await householdMemberIds(ctx, householdId);
    if (!members.has(input.paidByUserId)) throw new AppError("VALIDATION_ERROR", "결제한 사람은 가계 구성원이어야 합니다.");
  }

  return { currency: accounts.data.find((a) => a.id === input.accountId)!.currency_code };
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
