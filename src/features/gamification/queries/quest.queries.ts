import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { fromDbError } from "@/lib/errors";
import { commitments } from "@/features/analytics/utils/stats";
import { loadDailyCapacity } from "@/features/analytics/queries/capacity.queries";
import { getSchedulerContext } from "@/features/scheduler/queries/schedule.queries";
import { focusedMinutesInWindow } from "@/features/scheduler/utils/focus";
import { addLocalDays, localDayRange, localWeek, toLocalDate } from "@/features/scheduler/utils/timezone";
import { dayPlannedMinutes } from "@/features/scheduler/utils/today";
import type { DailyContext, QuestFacts, QuestMetric, QuestType, ObjectiveParams, WeeklyContext } from "../domain/quest.types";
import { loadXpRaw } from "./xp.queries";

const PAUSES = "pauses:work_session_pauses!work_session_pauses_session_id_user_id_fkey(paused_at, resumed_at)";
const isWorkDay = (d: string, days: number[]) => days.includes(new Date(`${d}T12:00:00Z`).getUTCDay());

function rootOf(domainId: string | null, parent: Record<string, string | null>): string | null {
  let d = domainId;
  for (let i = 0; d && parent[d] && i < 10; i++) d = parent[d];
  return d;
}

export type QuestGenContext = {
  today: string;
  tomorrow: string;
  week: { start: string; end: string };
  daily: DailyContext;
  weekly: WeeklyContext;
  recovery: { minMeaningful: number; lastTwoWorkDays: { date: string; focused: number }[]; hadEarlierActivity: boolean; lastRecoveryStart: string | null };
};

export async function loadQuestGenContext(supabase: SupabaseServerClient, userId: string, now: Date): Promise<QuestGenContext> {
  const { timezone: tz, settings } = await getSchedulerContext(supabase, userId);
  const today = toLocalDate(now, tz);
  const week = localWeek(today, tz, settings.week_starts_on);
  const todayRange = localDayRange(today, tz);
  const since = localDayRange(addLocalDays(today, -28, tz), tz).start;

  const [capacity, blocks, targetTasks, sessions, domains, earliest, lastRecovery] = await Promise.all([
    loadDailyCapacity(supabase, userId, now, settings, tz),
    supabase.from("schedule_blocks").select("task_id, starts_at, ends_at, status").eq("user_id", userId)
      .lt("starts_at", todayRange.end).gt("ends_at", todayRange.start),
    supabase.from("tasks").select("id").eq("user_id", userId).eq("target_date", today).not("status", "in", "(completed,cancelled)"),
    supabase.from("work_sessions").select(`task_id, started_at, ended_at, ${PAUSES}, task:tasks!work_sessions_task_id_user_id_fkey(practice_domain_id)`)
      .eq("user_id", userId).gte("started_at", since).limit(5000),
    supabase.from("practice_domains").select("id, parent_id").eq("user_id", userId),
    supabase.from("work_sessions").select("started_at").eq("user_id", userId).order("started_at").limit(1).maybeSingle(),
    supabase.from("quests").select("period_start").eq("user_id", userId).eq("type", "recovery").order("period_start", { ascending: false }).limit(1).maybeSingle(),
  ]);
  for (const r of [blocks, targetTasks, sessions, domains, earliest, lastRecovery]) if (r.error) throw fromDbError(r.error);

  const parent = Object.fromEntries(domains.data!.map((d) => [d.id, d.parent_id]));
  const nowMs = now.getTime();
  const sessionRows = sessions.data!.map((s) => ({ ...s, pauses: s.pauses ?? [] }));

  // Top root domain by focused minutes over the last 28 days.
  const byRoot = new Map<string, number>();
  for (const s of sessionRows) {
    const task = Array.isArray(s.task) ? s.task[0] : s.task;
    const root = rootOf(task?.practice_domain_id ?? null, parent);
    if (!root) continue;
    byRoot.set(root, (byRoot.get(root) ?? 0) + focusedMinutesInWindow(s, s.pauses, 0, nowMs, nowMs));
  }
  const topDomainId = [...byRoot].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const plannedBlocks = blocks.data!.filter((b) => b.status === "planned");
  const plannedTaskIds = [...new Set([...plannedBlocks.map((b) => b.task_id), ...targetTasks.data!.map((t) => t.id)])];

  // F2 picker inputs: the most important planned task (priority 1 = most important, ADR 0015) and the weakest active domain.
  const planned = plannedTaskIds.length
    ? await supabase.from("tasks").select("id, title, priority, created_at").eq("user_id", userId).in("id", plannedTaskIds.slice(0, 200))
    : { data: [] as { id: string; title: string; priority: number; created_at: string }[], error: null };
  if (planned.error) throw fromDbError(planned.error);
  const ranked = [...planned.data!].sort((a, b) => a.priority - b.priority || a.created_at.localeCompare(b.created_at));
  const topTask = ranked[0] ? { id: ranked[0].id, title: ranked[0].title } : null;
  const weakDomainId = [...byRoot].filter(([, m]) => m > 0).sort((a, b) => a[1] - b[1])[0]?.[0] ?? null;

  // Last two planned work days before today and their focused minutes.
  const lastTwoWorkDays: { date: string; focused: number }[] = [];
  for (let d = addLocalDays(today, -1, tz), i = 0; lastTwoWorkDays.length < 2 && i < 14; d = addLocalDays(d, -1, tz), i++) {
    if (!isWorkDay(d, settings.planned_work_days)) continue;
    const r = localDayRange(d, tz);
    const from = new Date(r.start).getTime();
    const to = new Date(r.end).getTime();
    lastTwoWorkDays.push({ date: d, focused: sessionRows.reduce((sum, s) => sum + focusedMinutesInWindow(s, s.pauses, from, to, nowMs), 0) });
  }
  const oldest = lastTwoWorkDays[lastTwoWorkDays.length - 1]?.date;
  const hadEarlierActivity = !!earliest.data && !!oldest && earliest.data.started_at < localDayRange(oldest, tz).start;

  const weekEnd = addLocalDays(week.endDate, -1, tz);
  return {
    today,
    tomorrow: addLocalDays(today, 1, tz),
    week: { start: week.startDate, end: weekEnd },
    daily: {
      date: today,
      capacity,
      plannedMinutes: dayPlannedMinutes(blocks.data!, todayRange),
      plannedTaskIds,
      topDomainId,
      topTask,
      weakDomainId,
      taskTitles: ranked.slice(0, 5).map((t) => t.title),
    },
    weekly: {
      weekStart: week.startDate,
      weekEnd,
      capacity,
      plannedWorkDayCount: week.days.filter((d) => isWorkDay(d, settings.planned_work_days)).length,
      topDomainId,
    },
    recovery: { minMeaningful: settings.min_meaningful_minutes, lastTwoWorkDays, hadEarlierActivity, lastRecoveryStart: lastRecovery.data?.period_start ?? null },
  };
}

/** Facts for evaluating quests over local days [from, to] (from E1's loader plus task domains, capacity and blocks booked since). */
export async function loadQuestFacts(supabase: SupabaseServerClient, userId: string, from: string, to: string, bookedSince: string, now: Date): Promise<QuestFacts> {
  const raw = await loadXpRaw(supabase, userId, from, to, now);
  const { settings } = await getSchedulerContext(supabase, userId);
  const taskIds = [...new Set([...raw.sessions.map((s) => s.task_id), ...raw.completedTasks.map((t) => t.id)])];
  const [tasks, domains, booked, capacity] = await Promise.all([
    taskIds.length
      ? supabase.from("tasks").select("id, status, completed_at, practice_domain_id").eq("user_id", userId).in("id", taskIds.slice(0, 1000))
      : Promise.resolve({ data: [], error: null }),
    supabase.from("practice_domains").select("id, parent_id").eq("user_id", userId),
    supabase.from("schedule_blocks").select("id, created_at, starts_at, ends_at, status").eq("user_id", userId).gte("created_at", bookedSince),
    loadDailyCapacity(supabase, userId, now, settings, raw.timezone),
  ]);
  for (const r of [tasks, domains, booked]) if (r.error) throw fromDbError(r.error);
  const status = new Map(raw.blocks.map((b) => [b.id, b.status]));
  const finals = commitments({ now: raw.now, settings: raw.settings, blocks: raw.blocks, revisions: raw.revisions, sessions: raw.sessions.map((s) => ({ ...s, focus_score: null })) })
    .filter((c) => c.kind === "final")
    .map((c) => {
      const st = status.get(c.blockId);
      return { blockId: c.blockId, resolvedAt: c.resolvedAt, score: c.score, kept: c.score >= 0.75 && st !== "skipped" && st !== "cancelled" };
    });
  const blocks = new Map([...raw.blocks, ...booked.data!].map((b) => [b.id, b]));
  return {
    timezone: raw.timezone,
    now: raw.now,
    plannedWorkDays: raw.settings.planned_work_days,
    capacity,
    sessions: raw.sessions.map((s) => ({ id: s.id, task_id: s.task_id, source: s.source, started_at: s.started_at, ended_at: s.ended_at, pauses: s.pauses })),
    tasks: Object.fromEntries(tasks.data!.map((t) => [t.id, { status: t.status, completedAt: t.completed_at, domainId: t.practice_domain_id }])),
    domainParent: Object.fromEntries(domains.data!.map((d) => [d.id, d.parent_id])),
    commitments: finals,
    blocks: [...blocks.values()],
  };
}

export type QuestRow = {
  id: string; type: QuestType; title: string; status: string; period_start: string; period_end: string;
  reward_xp: number; swap_used: boolean; spare: unknown; created_at: string; generated_by: string; reason: string | null;
  objectives: { id: string; position: number; metric: QuestMetric; params: ObjectiveParams; target_value: number; current_value: number; completed_at: string | null }[];
};

export async function listQuests(supabase: SupabaseServerClient, userId: string, filter: { active?: boolean; visibleOn?: string }): Promise<QuestRow[]> {
  let q = supabase
    .from("quests")
    .select("id, type, title, status, period_start, period_end, reward_xp, swap_used, spare, created_at, generated_by, reason, objectives:quest_objectives!quest_objectives_quest_id_user_id_fkey(id, position, metric, params, target_value, current_value, completed_at)")
    .eq("user_id", userId);
  if (filter.active) q = q.eq("status", "active");
  if (filter.visibleOn) q = q.in("status", ["active", "cleared"]).gte("period_end", filter.visibleOn).lte("period_start", filter.visibleOn);
  const { data, error } = await q.order("created_at");
  if (error) throw fromDbError(error);
  return (data as unknown as QuestRow[]).map((r) => ({ ...r, objectives: [...r.objectives].sort((a, b) => a.position - b.position) }));
}
