import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { fromDbError } from "@/lib/errors";
import { resolveBaseEstimate } from "../utils/duration";
import { addLocalDays, localDayRange } from "../utils/timezone";
import type { WeekInput } from "../utils/weekly-metrics";

/** Everything computeWeeklyMetrics needs for one local week. Bounded by the week (spec §50). */
export async function loadWeekInput(
  supabase: SupabaseServerClient,
  weekStart: string,
  timezone: string,
): Promise<WeekInput> {
  const weekEnd = addLocalDays(weekStart, 7, timezone);
  const range = { start: localDayRange(weekStart, timezone).start, end: localDayRange(weekEnd, timezone).start };

  const [blocks, sessions, reflections, completed, created, revisions] = await Promise.all([
    supabase
      .from("schedule_blocks")
      .select("starts_at, ends_at, status")
      .lt("starts_at", range.end)
      .gt("ends_at", range.start),
    supabase
      .from("work_sessions")
      .select(
        "started_at, ended_at, focus_score, mood_score, energy_score, task:tasks!work_sessions_task_id_user_id_fkey(template:task_templates!tasks_template_id_user_id_fkey(name))",
      )
      .lt("started_at", range.end)
      .gt("ended_at", range.start),
    supabase
      .from("daily_reflections")
      .select("mood_score, focus_score, energy_score")
      .gte("reflection_date", weekStart)
      .lt("reflection_date", weekEnd),
    supabase
      .from("tasks")
      .select(
        "id, user_estimated_minutes, template:task_templates!tasks_template_id_user_id_fkey(name, default_estimate_minutes)",
      )
      .eq("status", "completed")
      .gte("completed_at", range.start)
      .lt("completed_at", range.end),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .gte("created_at", range.start)
      .lt("created_at", range.end),
    supabase
      .from("schedule_block_revisions")
      .select("change_type, previous_starts_at, new_starts_at")
      .gte("created_at", range.start)
      .lt("created_at", range.end),
  ]);
  for (const r of [blocks, sessions, reflections, completed, created, revisions]) {
    if (r.error) throw fromDbError(r.error);
  }

  const completedRows = completed.data ?? [];
  const actual = new Map<string, number>();
  if (completedRows.length) {
    const pa = await supabase
      .from("task_plan_actual")
      .select("task_id, actual_minutes")
      .in("task_id", completedRows.map((t) => t.id));
    if (pa.error) throw fromDbError(pa.error);
    for (const r of pa.data) if (r.task_id) actual.set(r.task_id, Number(r.actual_minutes ?? 0));
  }

  return {
    range,
    timezone,
    weekStart,
    blocks: blocks.data ?? [],
    sessions: (sessions.data ?? []).map((s) => ({
      started_at: s.started_at,
      ended_at: s.ended_at,
      focus_score: s.focus_score,
      mood_score: s.mood_score,
      energy_score: s.energy_score,
      templateName: s.task?.template?.name ?? null,
    })),
    reflections: reflections.data ?? [],
    completedTasks: completedRows.map((t) => {
      const base = resolveBaseEstimate({
        userEstimatedMinutes: t.user_estimated_minutes,
        templateDefaultMinutes: t.template?.default_estimate_minutes ?? null,
      });
      return {
        templateName: t.template?.name ?? null,
        baseMinutes: base.source === "generic" ? null : base.minutes,
        actualMinutes: actual.get(t.id) ?? 0,
      };
    }),
    createdTaskCount: created.count ?? 0,
    revisions: revisions.data ?? [],
  };
}
