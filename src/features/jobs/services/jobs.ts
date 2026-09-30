import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { generateDailyRecommendations } from "@/features/ai/services/task-recommendation.service";
import { generateWeeklyReview } from "@/features/ai/services/weekly-review.service";
import { loadWeekInput } from "@/features/scheduler/queries/week.queries";
import { rebuildDurationGroups } from "@/features/scheduler/services/duration-groups.service";
import { writeDailySnapshot } from "@/features/analytics/services/snapshot.service";
import { markMissedBlocks } from "@/features/scheduler/services/scheduling.service";
import { todayLocalDate } from "@/features/scheduler/utils/timezone";
import { computeWeeklyMetrics } from "@/features/scheduler/utils/weekly-metrics";
import { inLocalWindow, isFirstDayOfWeek, previousWeekStart } from "../utils/job-window";
import { runJob, type JobOutcome } from "./job-runner";

/** Morning suggestions: local 05:00–10:00, once per local day. */
export function runDailyPlanner(admin: SupabaseServerClient, now = new Date()) {
  return runJob(
    "daily_planner",
    admin,
    now,
    (u) => (inLocalWindow(now, u.timezone, 5, 10) ? todayLocalDate(u.timezone, now) : null),
    async (ctx): Promise<JobOutcome> => {
      const run = await generateDailyRecommendations(ctx, now);
      return run.status === "created"
        ? { status: "succeeded", detail: { count: run.count, capacityMinutes: run.capacityMinutes } }
        : { status: "skipped", detail: { reason: run.reason } };
    },
  );
}

/** Last week's review on the first local day of the user's week. */
export function runWeeklyReview(admin: SupabaseServerClient, now = new Date()) {
  return runJob(
    "weekly_review",
    admin,
    now,
    (u) => (isFirstDayOfWeek(now, u.timezone, u.settings.week_starts_on)
      ? previousWeekStart(now, u.timezone, u.settings.week_starts_on)
      : null),
    async (ctx, user, weekStart): Promise<JobOutcome> => {
      const existing = await ctx.supabase
        .from("weekly_reviews")
        .select("id")
        .eq("user_id", user.id)
        .eq("week_start", weekStart)
        .maybeSingle();
      if (existing.data) return { status: "skipped", detail: { reason: "already reviewed" } };

      // No LLM call for an empty week (cost guard; nothing to interpret).
      const m = computeWeeklyMetrics(await loadWeekInput(ctx.supabase, user.id, weekStart, user.timezone));
      if (m.actualMinutes === 0 && m.plannedMinutes === 0 && m.completedTaskCount === 0) {
        return { status: "skipped", detail: { reason: "empty week" } };
      }
      await generateWeeklyReview(ctx, weekStart);
      return { status: "succeeded", detail: { weekStart } };
    },
  );
}

/** Nightly full rebuild of the derived duration profiles (spec §45, §61). */
export function runDurationProfileRefresh(admin: SupabaseServerClient, now = new Date()) {
  return runJob(
    "duration_profile_refresh",
    admin,
    now,
    (u) => todayLocalDate(u.timezone, now),
    async (ctx): Promise<JobOutcome> => {
      const missed = await markMissedBlocks(ctx.supabase, ctx.user.id);
      const groups = await rebuildDurationGroups(ctx);
      const snapshots = await writeDailySnapshot(ctx, now);
      return { status: "succeeded", detail: { groups, missed, snapshots } };
    },
  );
}
