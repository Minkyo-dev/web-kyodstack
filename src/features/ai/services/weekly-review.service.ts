import "server-only";
import type { ActionContext } from "@/lib/action";
import { fromDbError } from "@/lib/errors";
import { getSchedulerContext } from "@/features/scheduler/queries/schedule.queries";
import { loadWeekInput } from "@/features/scheduler/queries/week.queries";
import { localWeek, todayLocalDate } from "@/features/scheduler/utils/timezone";
import { computeWeeklyMetrics } from "@/features/scheduler/utils/weekly-metrics";
import { WEEKLY_REVIEW_PROMPT_VERSION, WEEKLY_REVIEW_SYSTEM, weeklyReviewPrompt } from "../prompts/weekly-review.prompt";
import { WeeklyReviewOutputSchema } from "../schemas/weekly-review.schema";
import { callAi } from "./budget.service";

/**
 * Weekly review (spec §32): deterministic metrics first, then the LLM interprets them.
 * Upsert on (user_id, week_start), so retries and duplicate jobs never create duplicates (§45, §47).
 */
export async function generateWeeklyReview(ctx: ActionContext, requestedWeek?: string) {
  const { timezone, settings } = await getSchedulerContext(ctx.supabase, ctx.user.id);
  const weekStart = localWeek(requestedWeek ?? todayLocalDate(timezone), timezone, settings.week_starts_on).startDate;

  const metrics = computeWeeklyMetrics(await loadWeekInput(ctx.supabase, ctx.user.id, weekStart, timezone));
  const result = await callAi(ctx, "weekly_review", {
    task: "weekly_review",
    system: WEEKLY_REVIEW_SYSTEM,
    prompt: weeklyReviewPrompt(metrics),
    schema: WeeklyReviewOutputSchema,
    effort: "medium",
  });

  const { data, error } = await ctx.supabase
    .from("weekly_reviews")
    .upsert(
      {
        user_id: ctx.user.id,
        week_start: weekStart,
        metrics,
        summary: result.data.summary,
        positives: result.data.positives,
        issues: result.data.issues,
        recommendations: result.data.recommendations,
        provider: result.provider,
        model: result.model,
        prompt_version: WEEKLY_REVIEW_PROMPT_VERSION,
      },
      { onConflict: "user_id,week_start" },
    )
    .select()
    .single();
  if (error) throw fromDbError(error);
  return data;
}
