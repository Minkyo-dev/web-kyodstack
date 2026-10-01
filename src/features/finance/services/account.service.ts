import "server-only";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { Account } from "../domain/finance.types";
import type { CreateAccountInput, ReorderInput, SetActiveInput, UpdateAccountInput } from "../schemas/finance.schema";
import { householdMemberIds, requireHousehold } from "./household.service";

async function assertOwner(ctx: ActionContext, householdId: string, ownerUserId: string | null) {
  if (ownerUserId === null) return;
  const members = await householdMemberIds(ctx, householdId);
  if (!members.has(ownerUserId)) throw new AppError("VALIDATION_ERROR", "소유자는 가계 구성원이어야 합니다.");
}

/**
 * ADR 0034: the payment account belongs to the household, is not the card itself and is not archived (unless the card
 * already uses it).
 */
async function assertPaymentAccount(ctx: ActionContext, householdId: string, input: CreateAccountInput, self: Account | null) {
  const id = input.paymentAccountId;
  if (id === null) return;
  if (id === self?.id) throw new AppError("VALIDATION_ERROR", "카드 자신을 출금 계좌로 고를 수 없습니다.");
  const { data, error } = await ctx.supabase
    .from("finance_accounts")
    .select("is_active")
    .eq("household_id", householdId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new AppError("VALIDATION_ERROR", "출금 계좌를 찾을 수 없습니다.");
  if (!data.is_active && self?.payment_account_id !== id)
    throw new AppError("VALIDATION_ERROR", "보관된 계좌는 출금 계좌로 고를 수 없습니다.");
}

/**
 * Records every card payment that fell due up to today (idempotent, one transfer per card per day; see the
 * migration). Runs after an account save and on every finance page load.
 */
export async function payDueCards(supabase: SupabaseServerClient, householdId: string): Promise<number> {
  const { data, error } = await supabase.rpc("finance_pay_cards", { p_household: householdId });
  if (error) throw fromDbError(error);
  return data ?? 0;
}

/** Daily job (service role): pays every household that has a card with a payment day, one call per household. */
export async function payAllHouseholds(admin: SupabaseServerClient) {
  const { data, error } = await admin
    .from("finance_accounts")
    .select("household_id")
    .eq("account_type", "CREDIT_CARD")
    .eq("is_active", true)
    .not("payment_day", "is", null);
  if (error) throw fromDbError(error);
  const households = [...new Set(data.map((r) => r.household_id))];
  let paid = 0;
  let failed = 0;
  for (const householdId of households) {
    try {
      paid += await payDueCards(admin, householdId);
    } catch {
      failed += 1;
    }
  }
  return { households: households.length, paid, failed };
}

export async function createAccount(ctx: ActionContext, input: CreateAccountInput): Promise<Account> {
  const { householdId } = await requireHousehold(ctx);
  await Promise.all([
    assertOwner(ctx, householdId, input.ownerUserId),
    assertPaymentAccount(ctx, householdId, input, null),
  ]);
  const [household, last] = await Promise.all([
    ctx.supabase.from("finance_households").select("base_currency").eq("id", householdId).single(),
    ctx.supabase
      .from("finance_accounts")
      .select("sort_order")
      .eq("household_id", householdId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (household.error) throw fromDbError(household.error);
  if (last.error) throw fromDbError(last.error);
  const { data, error } = await ctx.supabase
    .from("finance_accounts")
    .insert({
      household_id: householdId,
      name: input.name,
      account_type: input.accountType,
      institution_name: input.institutionName,
      ownership_type: input.ownershipType,
      owner_user_id: input.ownerUserId,
      currency_code: household.data.base_currency,
      sort_order: (last.data?.sort_order ?? -1) + 1,
      payment_day: input.paymentDay,
      payment_account_id: input.paymentAccountId,
    })
    .select()
    .single();
  if (error) throw fromDbError(error);
  return data;
}

export async function updateAccount(ctx: ActionContext, input: UpdateAccountInput): Promise<Account> {
  const { householdId } = await requireHousehold(ctx);
  const before = await ctx.supabase
    .from("finance_accounts")
    .select("*")
    .eq("id", input.accountId)
    .eq("household_id", householdId)
    .maybeSingle();
  if (before.error) throw fromDbError(before.error);
  if (!before.data) throw new AppError("NOT_FOUND");
  await Promise.all([
    assertOwner(ctx, householdId, input.ownerUserId),
    assertPaymentAccount(ctx, householdId, input, before.data),
  ]);
  const { data, error } = await ctx.supabase
    .from("finance_accounts")
    .update({
      name: input.name,
      account_type: input.accountType,
      institution_name: input.institutionName,
      ownership_type: input.ownershipType,
      owner_user_id: input.ownerUserId,
      payment_day: input.paymentDay,
      payment_account_id: input.paymentAccountId,
    })
    .eq("id", input.accountId)
    .eq("household_id", householdId)
    .select()
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new AppError("NOT_FOUND");
  await payDueCards(ctx.supabase, householdId);
  return data;
}

/** Archive (spec §6): transactions keep pointing at the account; it leaves the pickers. */
export async function setAccountActive(ctx: ActionContext, input: SetActiveInput): Promise<void> {
  const { householdId } = await requireHousehold(ctx);
  const { data, error } = await ctx.supabase
    .from("finance_accounts")
    .update({ is_active: input.active })
    .eq("id", input.id)
    .eq("household_id", householdId)
    .select("id")
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new AppError("NOT_FOUND");
}

export async function reorderAccounts(ctx: ActionContext, input: ReorderInput): Promise<void> {
  const { householdId } = await requireHousehold(ctx);
  const { data, error } = await ctx.supabase
    .from("finance_accounts")
    .select("id")
    .eq("household_id", householdId)
    .in("id", input.ids);
  if (error) throw fromDbError(error);
  if (data.length !== new Set(input.ids).size) throw new AppError("NOT_FOUND");
  const res = await ctx.supabase.rpc("finance_reorder", { p_table: "accounts", p_ids: input.ids });
  if (res.error) throw fromDbError(res.error);
}
