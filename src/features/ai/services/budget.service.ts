import "server-only";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import { getSchedulerContext } from "@/features/scheduler/queries/schedule.queries";
import { localDayRange, todayLocalDate } from "@/features/scheduler/utils/timezone";
import { getAiProvider, type StructuredRequest, type StructuredResult } from "./provider";

export const AI_DAILY_CAP = 30;

/** Calls made today (user's local day). Explicit user_id so it also works under the service role. */
export async function aiCallsToday(ctx: ActionContext, now = new Date()): Promise<number> {
  const { timezone } = await getSchedulerContext(ctx.supabase, ctx.user.id);
  const start = localDayRange(todayLocalDate(timezone, now), timezone).start;
  const { count, error } = await ctx.supabase
    .from("ai_calls")
    .select("id", { count: "exact", head: true })
    .eq("user_id", ctx.user.id)
    .gte("created_at", start);
  if (error) throw fromDbError(error);
  return count ?? 0;
}

/** Budgeted AI call: cap check → provider → ledger row (ok or not). Never logs prompt content. */
export async function callAi<T>(ctx: ActionContext, kind: string, req: StructuredRequest<T>): Promise<StructuredResult<T>> {
  if ((await aiCallsToday(ctx)) >= AI_DAILY_CAP) throw new AppError("AI_BUDGET_EXCEEDED");
  const provider = await getAiProvider();
  try {
    const result = await provider.generateStructured(req);
    await ctx.supabase.from("ai_calls").insert({ user_id: ctx.user.id, kind, model: result.model, ok: true });
    return result;
  } catch (error) {
    await ctx.supabase.from("ai_calls").insert({ user_id: ctx.user.id, kind, model: null, ok: false });
    throw error;
  }
}
