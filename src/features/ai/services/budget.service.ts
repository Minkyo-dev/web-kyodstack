import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { AppError, fromDbError } from "@/lib/errors";
import { getSchedulerContext } from "@/features/scheduler/queries/schedule.queries";
import { localDayRange, todayLocalDate } from "@/features/scheduler/utils/timezone";
import { AI_POOL_CAPS, poolOf, type AiPool } from "../utils/budget-pools";
import { getAiProvider, type StructuredRequest, type StructuredResult } from "./provider";

export const AI_DAILY_CAP = AI_POOL_CAPS.default;

/** Who is calling; an ActionContext fits, and so do jobs and the 단어장 services. */
type AiCtx = { user: { id: string }; supabase: SupabaseServerClient };

/** Calls made today in one pool (user's local day). Explicit user_id so it also works under the service role. */
export async function aiCallsToday(ctx: AiCtx, now = new Date(), pool: AiPool = "default"): Promise<number> {
  const { timezone } = await getSchedulerContext(ctx.supabase, ctx.user.id);
  const start = localDayRange(todayLocalDate(timezone, now), timezone).start;
  const query = ctx.supabase.from("ai_calls").select("id", { count: "exact", head: true }).eq("user_id", ctx.user.id).gte("created_at", start);
  const { count, error } = await (pool === "vocab" ? query.like("kind", "vocab.%") : query.not("kind", "like", "vocab.%"));
  if (error) throw fromDbError(error);
  return count ?? 0;
}

const POOL_EXCEEDED: Record<AiPool, string | undefined> = {
  default: undefined,
  vocab: "오늘 단어장 AI 사용량을 다 썼어요. 내일 다시 시도해 주세요.",
};

/** Budgeted AI call: cap check (per pool) → provider → ledger row (ok or not). Never logs prompt content. */
export async function callAi<T>(ctx: AiCtx, kind: string, req: StructuredRequest<T>): Promise<StructuredResult<T>> {
  const pool = poolOf(kind);
  if ((await aiCallsToday(ctx, new Date(), pool)) >= AI_POOL_CAPS[pool]) throw new AppError("AI_BUDGET_EXCEEDED", POOL_EXCEEDED[pool]);
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
