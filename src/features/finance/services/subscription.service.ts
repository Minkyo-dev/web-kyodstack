import "server-only";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { addLocalDays, todayLocalDate } from "@/features/scheduler/utils/timezone";
import type { Subscription } from "../domain/finance.types";
import type { CreateSubscriptionInput, UpdateSubscriptionInput } from "../schemas/finance.schema";
import { householdMemberIds, requireHousehold } from "./household.service";

type Kept = Pick<Subscription, "account_id" | "category_id"> | null;

/**
 * Spec §34 applied to a plan: account, category and payer belong to the caller's household; the category is an
 * expense category. Archived or deleted ones are rejected unless the plan already uses them.
 */
async function checkReferences(ctx: ActionContext, householdId: string, input: CreateSubscriptionInput, kept: Kept) {
  const [account, category, members] = await Promise.all([
    ctx.supabase.from("finance_accounts").select("is_active").eq("household_id", householdId).eq("id", input.accountId).maybeSingle(),
    ctx.supabase
      .from("finance_categories")
      .select("type, is_active")
      .eq("household_id", householdId)
      .eq("id", input.categoryId)
      .maybeSingle(),
    input.paidByUserId ? householdMemberIds(ctx, householdId) : Promise.resolve(new Set<string>()),
  ]);
  if (account.error) throw fromDbError(account.error);
  if (category.error) throw fromDbError(category.error);
  if (!account.data) throw new AppError("VALIDATION_ERROR", "계좌를 찾을 수 없습니다.");
  if (!account.data.is_active && kept?.account_id !== input.accountId)
    throw new AppError("VALIDATION_ERROR", "보관된 계좌는 선택할 수 없습니다.");
  if (!category.data) throw new AppError("VALIDATION_ERROR", "카테고리를 찾을 수 없습니다.");
  if (category.data.type !== "EXPENSE") throw new AppError("VALIDATION_ERROR", "정기 결제는 지출 카테고리만 쓸 수 있습니다.");
  if (!category.data.is_active && kept?.category_id !== input.categoryId)
    throw new AppError("VALIDATION_ERROR", "보관된 카테고리는 새로 선택할 수 없습니다.");
  if (input.paidByUserId && !members.has(input.paidByUserId))
    throw new AppError("VALIDATION_ERROR", "결제한 사람은 가계 구성원이어야 합니다.");
}

function toRow(input: CreateSubscriptionInput) {
  return {
    name: input.name,
    amount: input.amount,
    billing_cycle: input.billingCycle,
    billing_day: input.billingDay,
    billing_month: input.billingMonth,
    start_date: input.startDate,
    end_date: input.endDate,
    account_id: input.accountId,
    category_id: input.categoryId,
    paid_by_user_id: input.paidByUserId,
    note: input.note,
  };
}

/**
 * Records every due charge up to today (idempotent, one transaction per plan per day; see the migration). Used after a
 * save and on every finance page load, so charges appear without waiting for the daily job.
 */
export async function chargeDueSubscriptions(supabase: SupabaseServerClient, householdId: string): Promise<number> {
  const { data, error } = await supabase.rpc("finance_charge_subscriptions", { p_household: householdId });
  if (error) throw fromDbError(error);
  return data ?? 0;
}

export async function createSubscription(ctx: ActionContext, input: CreateSubscriptionInput): Promise<{ charged: number }> {
  const { householdId } = await requireHousehold(ctx);
  await checkReferences(ctx, householdId, input, null);
  const { error } = await ctx.supabase
    .from("finance_subscriptions")
    .insert({ ...toRow(input), household_id: householdId, created_by_user_id: ctx.user.id });
  if (error) throw fromDbError(error);
  return { charged: await chargeDueSubscriptions(ctx.supabase, householdId) };
}

/** Changes apply to future charges only; past charges are ordinary transactions and stay as they are. */
export async function updateSubscription(ctx: ActionContext, input: UpdateSubscriptionInput): Promise<{ charged: number }> {
  const { householdId } = await requireHousehold(ctx);
  const before = await ctx.supabase
    .from("finance_subscriptions")
    .select("account_id, category_id")
    .eq("id", input.subscriptionId)
    .eq("household_id", householdId)
    .maybeSingle();
  if (before.error) throw fromDbError(before.error);
  if (!before.data) throw new AppError("NOT_FOUND");
  await checkReferences(ctx, householdId, input, before.data);
  const { data, error } = await ctx.supabase
    .from("finance_subscriptions")
    .update(toRow(input))
    .eq("id", input.subscriptionId)
    .eq("household_id", householdId)
    .select("id")
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new AppError("NOT_FOUND");
  return { charged: await chargeDueSubscriptions(ctx.supabase, householdId) };
}

/**
 * Pause or resume. Resuming never back-fills the paused period: charging restarts from today (a charge due today is
 * still recorded).
 */
export async function setSubscriptionActive(ctx: ActionContext, input: { id: string; active: boolean }): Promise<void> {
  const { householdId } = await requireHousehold(ctx);
  const patch: { is_active: boolean; charged_through?: string } = { is_active: input.active };
  if (input.active) {
    const [household, current] = await Promise.all([
      ctx.supabase.from("finance_households").select("timezone").eq("id", householdId).single(),
      ctx.supabase.from("finance_subscriptions").select("charged_through").eq("id", input.id).eq("household_id", householdId).maybeSingle(),
    ]);
    if (household.error) throw fromDbError(household.error);
    if (current.error) throw fromDbError(current.error);
    if (!current.data) throw new AppError("NOT_FOUND");
    const zone = household.data.timezone;
    const yesterday = addLocalDays(todayLocalDate(zone), -1, zone);
    if (!current.data.charged_through || current.data.charged_through < yesterday) patch.charged_through = yesterday;
  }
  const { data, error } = await ctx.supabase
    .from("finance_subscriptions")
    .update(patch)
    .eq("id", input.id)
    .eq("household_id", householdId)
    .select("id")
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new AppError("NOT_FOUND");
  if (input.active) await chargeDueSubscriptions(ctx.supabase, householdId);
}

/** Deletes the plan. Its past charges stay as ordinary transactions (the link is cleared by the FK). */
export async function deleteSubscription(ctx: ActionContext, id: string): Promise<void> {
  const { householdId } = await requireHousehold(ctx);
  const { data, error } = await ctx.supabase
    .from("finance_subscriptions")
    .delete()
    .eq("id", id)
    .eq("household_id", householdId)
    .select("id")
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new AppError("NOT_FOUND");
}

/**
 * Daily job (service role): charges every household that has an active plan. Each household is its own call, scoped
 * by `household_id`, so one failure does not stop the others.
 */
export async function chargeAllHouseholds(admin: SupabaseServerClient) {
  const { data, error } = await admin.from("finance_subscriptions").select("household_id").eq("is_active", true);
  if (error) throw fromDbError(error);
  const households = [...new Set(data.map((r) => r.household_id))];
  let charged = 0;
  let failed = 0;
  for (const householdId of households) {
    try {
      charged += await chargeDueSubscriptions(admin, householdId);
    } catch {
      failed += 1;
    }
  }
  return { households: households.length, charged, failed };
}
