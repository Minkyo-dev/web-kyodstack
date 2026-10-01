import "server-only";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import { todayLocalDate } from "@/features/scheduler/utils/timezone";
import type { ClearMonthBudgetInput, SetDefaultBudgetInput, SetMonthBudgetInput } from "../schemas/finance.schema";
import { requireHousehold } from "./household.service";

/** The first day of the household's current month ("yyyy-MM-01"), in its timezone. */
async function currentMonth(ctx: ActionContext, householdId: string): Promise<string> {
  const { data, error } = await ctx.supabase.from("finance_households").select("timezone").eq("id", householdId).single();
  if (error) throw fromDbError(error);
  return `${todayLocalDate(data.timezone).slice(0, 7)}-01`;
}

/** Budgets go on top-level, non-deleted expense categories of the caller's household (the DB trigger agrees). */
async function assertBudgetCategory(ctx: ActionContext, householdId: string, categoryId: string) {
  const { data, error } = await ctx.supabase
    .from("finance_categories")
    .select("type, parent_id, deleted_at")
    .eq("id", categoryId)
    .eq("household_id", householdId)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new AppError("NOT_FOUND");
  if (data.type !== "EXPENSE" || data.parent_id !== null || data.deleted_at !== null) {
    throw new AppError("VALIDATION_ERROR", "예산은 상위 지출 카테고리에만 정할 수 있습니다.");
  }
}

/** ADR 0033: the default applies from the current month on; earlier months keep the default they had. */
export async function setDefaultBudget(ctx: ActionContext, input: SetDefaultBudgetInput): Promise<{ fromMonth: string }> {
  const { householdId } = await requireHousehold(ctx);
  await assertBudgetCategory(ctx, householdId, input.categoryId);
  const month = await currentMonth(ctx, householdId);
  const { error } = await ctx.supabase.from("finance_budgets").upsert(
    {
      household_id: householdId,
      category_id: input.categoryId,
      month,
      kind: "DEFAULT",
      amount: input.amount,
      created_by_user_id: ctx.user.id,
    },
    { onConflict: "household_id,category_id,kind,month" },
  );
  if (error) throw fromDbError(error);
  return { fromMonth: month.slice(0, 7) };
}

async function assertEditableMonth(ctx: ActionContext, householdId: string, month: string): Promise<string> {
  const first = `${month}-01`;
  if (first < (await currentMonth(ctx, householdId))) {
    throw new AppError("VALIDATION_ERROR", "지난 달 예산은 바꿀 수 없습니다.");
  }
  return first;
}

export async function setMonthBudget(ctx: ActionContext, input: SetMonthBudgetInput): Promise<void> {
  const { householdId } = await requireHousehold(ctx);
  await assertBudgetCategory(ctx, householdId, input.categoryId);
  const month = await assertEditableMonth(ctx, householdId, input.month);
  const { error } = await ctx.supabase.from("finance_budgets").upsert(
    {
      household_id: householdId,
      category_id: input.categoryId,
      month,
      kind: "MONTH",
      amount: input.amount,
      created_by_user_id: ctx.user.id,
    },
    { onConflict: "household_id,category_id,kind,month" },
  );
  if (error) throw fromDbError(error);
}

export async function clearMonthBudget(ctx: ActionContext, input: ClearMonthBudgetInput): Promise<void> {
  const { householdId } = await requireHousehold(ctx);
  const month = await assertEditableMonth(ctx, householdId, input.month);
  const { error } = await ctx.supabase
    .from("finance_budgets")
    .delete()
    .eq("household_id", householdId)
    .eq("category_id", input.categoryId)
    .eq("kind", "MONTH")
    .eq("month", month);
  if (error) throw fromDbError(error);
}
