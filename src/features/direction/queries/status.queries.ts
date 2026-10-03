import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { fromDbError } from "@/lib/errors";
import { getSchedulerContext } from "@/features/scheduler/queries/schedule.queries";
import { focusStats } from "@/features/scheduler/utils/focus";
import { addLocalDays, localDayRange, toLocalDate } from "@/features/scheduler/utils/timezone";
import { isoWeekday } from "../domain/habits";
import { diagnose, median, type Diagnosis } from "../domain/diagnosis";
import { forecast, type Forecast } from "../domain/forecast";
import {
  alignment,
  habitConsistency,
  identityEvidence,
  missionProgress,
  missionProgressBefore,
  paceGap,
  type CriterionInput,
  type HabitInput,
  type MissionProgress,
} from "../domain/status";

const PAUSES = "pauses:work_session_pauses!work_session_pauses_session_id_user_id_fkey(paused_at, resumed_at)";
const TASK_LINK =
  "task:tasks!work_sessions_task_id_user_id_fkey(mission_id, protocol_id, protocol:protocols!tasks_protocol_id_mission_id_fkey(path:paths!protocols_path_id_mission_id_fkey(status)), project:projects!tasks_project_id_user_id_fkey(mission_id))";
const WINDOW_DAYS = 28;
const MAX_MISSIONS = 3;

export type MissionStatusView = {
  id: string;
  title: string;
  deadline: string | null;
  progress: MissionProgress;
  pace: number | null;
  forecast: Forecast;
  path: { title: string; approach: string } | null;
  diagnosis: Diagnosis;
};
export type DirectionStatus = {
  today: string;
  weekStart: string;
  missions: MissionStatusView[];
  week: {
    activeMinutes: number;
    alignedMinutes: number;
    offPathMinutes: number;
    tasksDone: number;
    tasksTotal: number;
    habitsDone: number;
    habitsScheduled: number;
  };
  identities: { id: string; name: string; sessions: number; done: number; scheduled: number; sentence: string | null }[];
};

/** Everything the progress page's direction section shows, computed by the pure G3 functions. */
export async function loadDirectionStatus(
  supabase: SupabaseServerClient,
  userId: string,
  now: Date,
  opts: { recovery?: number | null } = {},
): Promise<DirectionStatus> {
  const { timezone } = await getSchedulerContext(supabase, userId);
  const today = toLocalDate(now, timezone);
  const weekStart = addLocalDays(today, 1 - isoWeekday(today), timezone);
  const windowStart = addLocalDays(today, 1 - WINDOW_DAYS, timezone);
  const since = localDayRange(windowStart, timezone).start;
  const weekRange = { start: localDayRange(weekStart, timezone).start, end: localDayRange(addLocalDays(weekStart, 6, timezone), timezone).end };

  const [missions, criteria, paths, links, identities, sessions, blocks, habits, checks, recentBlocks, logs, protocols] = await Promise.all([
    supabase.from("missions").select("id, title, deadline, created_at").eq("user_id", userId).eq("status", "active"),
    supabase.from("mission_criteria").select("mission_id, kind, met_at, current_value, target_value").eq("user_id", userId),
    supabase.from("paths").select("mission_id, title, approach").eq("user_id", userId).eq("status", "active"),
    supabase.from("mission_identities").select("mission_id, identity_id").eq("user_id", userId),
    supabase.from("identities").select("id, name").eq("user_id", userId).eq("status", "active").order("sort_order"),
    supabase
      .from("work_sessions")
      .select(`started_at, ended_at, ${PAUSES}, ${TASK_LINK}`)
      .eq("user_id", userId)
      .gte("ended_at", since)
      .lte("ended_at", now.toISOString())
      .limit(2000),
    supabase
      .from("schedule_blocks")
      .select("task_id, task:tasks!schedule_blocks_task_id_user_id_fkey(status)")
      .eq("user_id", userId)
      .neq("status", "cancelled")
      .gte("starts_at", weekRange.start)
      .lt("starts_at", weekRange.end)
      .limit(2000),
    supabase.from("habits").select("id, weekdays, created_at, mission_id").eq("user_id", userId).eq("status", "active"),
    supabase.from("habit_checks").select("habit_id, local_date").eq("user_id", userId).gte("local_date", windowStart).lte("local_date", today),
    supabase
      .from("schedule_blocks")
      .select("status, task:tasks!schedule_blocks_task_id_user_id_fkey(mission_id, project:projects!tasks_project_id_user_id_fkey(mission_id))")
      .eq("user_id", userId)
      .neq("status", "cancelled")
      .gte("starts_at", since)
      .lte("ends_at", now.toISOString())
      .limit(2000),
    supabase
      .from("work_logs")
      .select("confirmed_blocker, task:tasks!work_logs_task_id_user_id_fkey(mission_id, project:projects!tasks_project_id_user_id_fkey(mission_id))")
      .eq("user_id", userId)
      .gte("created_at", since)
      .limit(2000),
    supabase
      .from("protocols")
      .select("id, mission_id, intended_minutes, path:paths!protocols_path_id_mission_id_fkey(status)")
      .eq("user_id", userId)
      .eq("status", "active"),
  ]);
  for (const r of [missions, criteria, paths, links, identities, sessions, blocks, habits, checks, recentBlocks, logs, protocols]) {
    if (r.error) throw fromDbError(r.error);
  }

  const missionIds = missions.data!.map((m) => m.id);
  const projectTasks = missionIds.length
    ? await supabase
        .from("tasks")
        .select("status, completed_at, project:projects!tasks_project_id_user_id_fkey!inner(mission_id)")
        .eq("user_id", userId)
        .in("project.mission_id", missionIds)
        .limit(5000)
    : { data: [], error: null };
  if (projectTasks.error) throw fromDbError(projectTasks.error);

  const ended = sessions.data!.map((s) => {
    const task = s.task;
    return {
      endedAt: s.ended_at!,
      focusedMinutes: focusStats(s, s.pauses ?? []).focusedMs / 60_000,
      missionId: task?.mission_id ?? task?.project?.mission_id ?? null,
      protocolId: task?.protocol_id ?? null,
      pathActive: task?.protocol ? task.protocol.path?.status === "active" : null,
    };
  });
  const week = ended.filter((s) => s.endedAt >= weekRange.start);
  const a = alignment(week);

  const blockTasks = new Map<string, string>();
  for (const b of blocks.data!) if (b.task) blockTasks.set(b.task_id, b.task.status);
  const live = [...blockTasks.values()].filter((st) => st !== "cancelled");

  const habitInputs: HabitInput[] = habits.data!.map((h) => ({
    id: h.id,
    weekdays: h.weekdays,
    createdDate: toLocalDate(h.created_at, timezone),
    missionId: h.mission_id,
  }));
  const checkInputs = checks.data!.map((c) => ({ habitId: c.habit_id, date: c.local_date }));
  const hw = habitConsistency(habitInputs, checkInputs, weekStart, today);

  const missionOf = (t: { mission_id: string | null; project: { mission_id: string | null } | null } | null) =>
    t?.mission_id ?? t?.project?.mission_id ?? null;

  /** diagnosis-v1 inputs for one mission over the 28-day window. */
  const diagnosisFor = (m: { id: string }, progress: MissionProgress, pace: number | null, ratioBefore: number | null) => {
    const mine = ended.filter((s) => s.missionId === m.id);
    const onPath = protocols.data!.filter((p) => p.mission_id === m.id && p.intended_minutes && p.path?.status === "active");
    const byProtocol = onPath
      .map((p) => ({ p, minutes: mine.filter((s) => s.protocolId === p.id).map((s) => s.focusedMinutes) }))
      .sort((a, b) => b.minutes.length - a.minutes.length)[0];
    const habit = habitConsistency(habitInputs.filter((h) => h.missionId === m.id), checkInputs, windowStart, today);
    const mBlocks = recentBlocks.data!.filter((b) => missionOf(b.task) === m.id);
    const mLogs = logs.data!.filter((l) => missionOf(l.task) === m.id);
    return diagnose({
      missionSessions: mine.length,
      pace,
      ratioNow: progress.ratio,
      ratioBefore,
      habit,
      protocolSessions: byProtocol?.minutes.length
        ? { medianMinutes: median(byProtocol.minutes)!, intendedMinutes: byProtocol.p.intended_minutes!, count: byProtocol.minutes.length }
        : null,
      blocks: { total: mBlocks.length, missedOrSkipped: mBlocks.filter((b) => b.status === "missed" || b.status === "skipped").length },
      logs: { total: mLogs.length, blockers: mLogs.filter((l) => l.confirmed_blocker === true).length },
      recovery: opts.recovery ?? null,
    });
  };

  const sorted = [...missions.data!].sort(
    (x, y) => (x.deadline ?? "9999").localeCompare(y.deadline ?? "9999") || x.created_at.localeCompare(y.created_at),
  );
  const missionViews = sorted.slice(0, MAX_MISSIONS).map((m): MissionStatusView => {
    const criteriaRows = criteria.data!.filter((c) => c.mission_id === m.id) as CriterionInput[];
    const tasksOf = projectTasks.data!.filter((t) => t.project?.mission_id === m.id);
    const progress = missionProgress({
      criteria: criteriaRows,
      projectTasks: tasksOf,
      focusMinutes: Math.round(ended.filter((s) => s.missionId === m.id).reduce((x, s) => x + s.focusedMinutes, 0)),
    });
    const createdDate = toLocalDate(m.created_at, timezone);
    const pace = paceGap({ createdDate, deadline: m.deadline, today, ratio: progress.ratio });
    const ratioBefore = progress.ratio === null ? null : missionProgressBefore({ criteria: criteriaRows, projectTasks: tasksOf, since });
    const openNumeric = criteriaRows.some((c) => c.kind === "numeric" && !c.met_at);
    const path = paths.data!.find((p) => p.mission_id === m.id);
    return {
      id: m.id,
      title: m.title,
      deadline: m.deadline,
      progress,
      pace,
      forecast: forecast({ ratio: progress.ratio, ratioBefore, createdDate, deadline: m.deadline, today, openNumeric }),
      path: path ? { title: path.title, approach: path.approach } : null,
      diagnosis: diagnosisFor(m, progress, pace, ratioBefore),
    };
  });

  const identityViews = identities.data!.map((i) => {
    const ms = new Set(links.data!.filter((l) => l.identity_id === i.id).map((l) => l.mission_id));
    const hc = habitConsistency(
      habitInputs.filter((h) => h.missionId && ms.has(h.missionId)),
      checkInputs,
      windowStart,
      today,
    );
    const ev = identityEvidence({
      name: i.name,
      sessions: ended.filter((s) => s.missionId && ms.has(s.missionId)).length,
      done: hc.done,
      scheduled: hc.scheduled,
    });
    return { id: i.id, name: i.name, ...ev };
  });

  return {
    today,
    weekStart,
    missions: missionViews,
    week: {
      activeMinutes: Math.round(a.activeMinutes),
      alignedMinutes: Math.round(a.alignedMinutes),
      offPathMinutes: Math.round(a.offPathMinutes),
      tasksDone: live.filter((st) => st === "completed").length,
      tasksTotal: live.length,
      habitsDone: hw.done,
      habitsScheduled: hw.scheduled,
    },
    identities: identityViews,
  };
}
