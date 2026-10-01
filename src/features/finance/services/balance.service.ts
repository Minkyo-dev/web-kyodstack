import "server-only";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import type { ReconcileInput } from "../schemas/finance.schema";
import { getAccountBalances } from "../queries/finance.queries";
import { requireHousehold } from "./household.service";

async function assertAccount(ctx: ActionContext, householdId: string, accountId: string) {
  const { data, error } = await ctx.supabase
    .from("finance_accounts")
    .select("id")
    .eq("id", accountId)
    .eq("household_id", householdId)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new AppError("NOT_FOUND");
}

/** The computed balance on a date, for the reconcile dialog's preview. */
export async function getAccountBalanceOn(ctx: ActionContext, accountId: string, date: string): Promise<number> {
  const { householdId } = await requireHousehold(ctx);
  await assertAccount(ctx, householdId, accountId);
  const balances = await getAccountBalances(ctx.supabase, householdId, date);
  return balances.find((b) => b.accountId === accountId)?.balance ?? 0;
}

/**
 * Reconcile (ADR 0032): the DB function records the difference as one ADJUSTMENT under a row lock and returns it
 * (0 = already matched, nothing written).
 */
export async function reconcileAccount(ctx: ActionContext, input: ReconcileInput): Promise<{ difference: number }> {
  const { householdId } = await requireHousehold(ctx);
  await assertAccount(ctx, householdId, input.accountId);
  const { data, error } = await ctx.supabase.rpc("finance_reconcile_account", {
    p_account: input.accountId,
    p_date: input.date,
    p_actual: input.actual,
  });
  if (error) {
    if (error.code === "22023") throw new AppError("VALIDATION_ERROR", "미래 날짜의 잔액은 맞출 수 없습니다.");
    throw fromDbError(error);
  }
  return { difference: Number(data) };
}
