import "server-only";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import { log } from "@/lib/logger";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { loadStatInput } from "@/features/analytics/queries/stat-input.queries";
import { listSnapshots } from "@/features/analytics/queries/snapshots.queries";
import { computeStats } from "@/features/analytics/utils/stats";
import { getSchedulerContext } from "@/features/scheduler/queries/schedule.queries";
import { addLocalDays, localDayRange, toLocalDate } from "@/features/scheduler/utils/timezone";
import { ANALYSIS_PROMPT_VERSION, ANALYSIS_SYSTEM, analysisPrompt } from "../prompts/analysis.prompt";
import { AnalysisOutputSchema } from "../schemas/analysis.schema";
import { analysisDue, analysisInput, analysisSlot, checkEvidence, directionInput, type AnalysisContent } from "../utils/analysis";
import { loadDirectionStatus } from "@/features/direction/queries/status.queries";
import { callAi } from "./budget.service";

export type AnalysisRow = { id: string; content: AnalysisContent; created_at: string; period_start: string; period_end: string };

export async function latestAnalysis(supabase: SupabaseServerClient, userId: string): Promise<AnalysisRow | null> {
  const { data, error } = await supabase
    .from("system_insights")
    .select("id, content, created_at, period_start, period_end")
    .eq("user_id", userId)
    .eq("kind", "weekly_analysis")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw fromDbError(error);
  return data ? { ...data, content: data.content as unknown as AnalysisContent } : null;
}

/** Explain the deterministic stats; stores nothing when no explanation survives the evidence check. */
export async function generateAnalysis(ctx: ActionContext, now: Date): Promise<AnalysisRow | null> {
  const statInput = await loadStatInput(ctx.supabase, ctx.user.id, now);
  const stats = computeStats(statInput);
  const tz = statInput.timezone;
  const today = toLocalDate(now, tz);
  const snapshots = await listSnapshots(ctx.supabase, ctx.user.id, addLocalDays(today, -35, tz));
  // G4: the deterministic direction diagnosis (numbers only); a failure just leaves it out.
  const direction = await loadDirectionStatus(ctx.supabase, ctx.user.id, now, { recovery: stats.recovery.value })
    .then((s) => directionInput(s.missions))
    .catch(() => []);
  const input = { ...analysisInput({ stats, snapshots, today, tz }), direction };
  const result = await callAi(ctx, "weekly_analysis", {
    task: "weekly_analysis",
    system: ANALYSIS_SYSTEM,
    prompt: analysisPrompt(input),
    schema: AnalysisOutputSchema,
    effort: "low",
  });
  const content = checkEvidence(result.data, input);
  if (!content) return null;
  const { data, error } = await ctx.supabase
    .from("system_insights")
    .insert({
      user_id: ctx.user.id,
      kind: "weekly_analysis",
      period_start: addLocalDays(today, -7, tz),
      period_end: addLocalDays(today, -1, tz),
      input: input as never,
      content: content as never,
      model: result.model,
      prompt_version: ANALYSIS_PROMPT_VERSION,
    })
    .select("id, content, created_at, period_start, period_end")
    .single();
  if (error) throw fromDbError(error);
  return { ...data, content: data.content as unknown as AnalysisContent };
}

/** Generate when this week's chosen slot has passed and nothing was made since (page load + nightly). Never throws. */
export async function ensureAnalysis(ctx: ActionContext, now = new Date()): Promise<boolean> {
  try {
    const { timezone, settings } = await getSchedulerContext(ctx.supabase, ctx.user.id);
    const slot = analysisSlot(now, timezone, settings.insight_weekday, settings.insight_hour);
    const latest = await latestAnalysis(ctx.supabase, ctx.user.id);
    if (!analysisDue(slot, latest?.created_at ?? null)) return false;
    return (await generateAnalysis(ctx, now)) !== null;
  } catch (error) {
    log({ action: "ai.analysis.ensure", userId: ctx.user.id, success: false, errorCode: error instanceof AppError ? error.code : "INTERNAL_ERROR" });
    return false;
  }
}

/** [다시 분석]: once per local day. */
export async function reanalyze(ctx: ActionContext, now = new Date()): Promise<void> {
  const { timezone } = await getSchedulerContext(ctx.supabase, ctx.user.id);
  const latest = await latestAnalysis(ctx.supabase, ctx.user.id);
  if (latest && latest.created_at >= localDayRange(toLocalDate(now, timezone), timezone).start) {
    throw new AppError("CONFLICT", "오늘 이미 분석했어요.");
  }
  if (!(await generateAnalysis(ctx, now))) throw new AppError("AI_OUTPUT_INVALID");
}

export async function updateAnalysisSchedule(ctx: ActionContext, input: { weekday: number | null; hour: number }): Promise<void> {
  const { error } = await ctx.supabase
    .from("scheduler_settings")
    .update({ insight_weekday: input.weekday, insight_hour: input.hour })
    .eq("user_id", ctx.user.id);
  if (error) throw fromDbError(error);
}
