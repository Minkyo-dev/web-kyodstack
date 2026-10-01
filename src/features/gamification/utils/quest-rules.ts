/** Quest rules v1 (E2 spec §2). Pure: generation from context, objective values from facts. */
import { focusStats, focusedMinutesInWindow } from "@/features/scheduler/utils/focus";
import { addLocalDays, localDateTimeToIso, localDayRange, toLocalDate } from "@/features/scheduler/utils/timezone";
import { dayPlannedMinutes, overloadFor } from "@/features/scheduler/utils/today";
import {
  QUEST_META, type DailyContext, type ObjectiveDraft, type ObjectiveParams, type QuestDraft, type QuestFacts,
  type QuestMetric, type QuestWindow, type WeeklyContext,
} from "../domain/quest.types";

export const QUEST_RULES_VERSION = "quest-v1";
const t = (iso: string) => new Date(iso).getTime();
const round5 = (x: number) => Math.round(x / 5) * 5;
const round30 = (x: number) => Math.round(x / 30) * 30;

function splitUnique(pool: ObjectiveDraft[], take: number) {
  const seen = new Set<QuestMetric>();
  const unique = pool.filter((o) => (seen.has(o.metric) ? false : (seen.add(o.metric), true)));
  return { objectives: unique.slice(0, take), spare: unique.slice(take) };
}

export function dailyQuest(ctx: DailyContext): QuestDraft {
  const focus =
    ctx.capacity === null || ctx.plannedMinutes <= 0
      ? 60
      : Math.max(30, round5(Math.min(0.6 * ctx.capacity, ctx.plannedMinutes)));
  const pool: ObjectiveDraft[] = [
    { metric: "focus_minutes", params: {}, target: focus },
    ctx.plannedTaskIds.length
      ? { metric: "complete_planned_tasks", params: { taskIds: ctx.plannedTaskIds }, target: Math.min(2, ctx.plannedTaskIds.length) }
      : { metric: "complete_tasks", params: {}, target: 1 },
    ctx.topDomainId
      ? { metric: "domain_minutes", params: { domainId: ctx.topDomainId }, target: 30 }
      : { metric: "kept_commitments", params: {}, target: 1 },
    { metric: "early_session", params: { before: "12:00" }, target: 1 },
    { metric: "kept_commitments", params: {}, target: 1 },
  ];
  const { objectives, spare } = splitUnique(pool, 3);
  const meta = QUEST_META.daily;
  return { type: "daily", title: meta.title, periodStart: ctx.date, periodEnd: ctx.date, rewardXp: meta.reward, objectives, spare };
}

export function weeklyQuest(ctx: WeeklyContext): QuestDraft {
  const objectives: ObjectiveDraft[] = [
    { metric: "focus_minutes", params: {}, target: ctx.capacity === null ? 300 : Math.max(30, round30(0.6 * ctx.capacity * ctx.plannedWorkDayCount)) },
    { metric: "kept_commitment_rate", params: { min: 4 }, target: 75 },
    ctx.topDomainId
      ? { metric: "domain_sessions", params: { domainId: ctx.topDomainId }, target: 3 }
      : { metric: "complete_tasks", params: {}, target: 5 },
  ];
  if (ctx.capacity !== null) objectives.push({ metric: "days_within_capacity", params: {}, target: Math.max(1, ctx.plannedWorkDayCount - 1) });
  const meta = QUEST_META.weekly;
  return { type: "weekly", title: meta.title, periodStart: ctx.weekStart, periodEnd: ctx.weekEnd, rewardXp: meta.reward, objectives, spare: [] };
}

export function recoveryQuest(today: string, tomorrow: string): QuestDraft {
  const meta = QUEST_META.recovery;
  return {
    type: "recovery",
    title: meta.title,
    periodStart: today,
    periodEnd: tomorrow,
    rewardXp: meta.reward,
    objectives: [
      { metric: "booked_block", params: { minMinutes: 30 }, target: 1 },
      { metric: "started_session", params: {}, target: 1 },
    ],
    spare: [],
  };
}

/** Two most recent planned work days before today were quiet, there was activity before, no recovery in 7 days. */
export function recoveryDue(input: {
  today: string;
  minMeaningful: number;
  lastTwoWorkDays: { date: string; focused: number }[];
  hadEarlierActivity: boolean;
  lastRecoveryStart: string | null;
}): boolean {
  if (input.lastTwoWorkDays.length < 2 || !input.hadEarlierActivity) return false;
  if (input.lastTwoWorkDays.some((d) => d.focused >= input.minMeaningful)) return false;
  if (input.lastRecoveryStart) {
    const days = (t(`${input.today}T12:00:00Z`) - t(`${input.lastRecoveryStart}T12:00:00Z`)) / 86_400_000;
    if (days < 7) return false;
  }
  return true;
}

export function nextSwap(current: { metric: QuestMetric; completed: boolean }[], spare: ObjectiveDraft[]) {
  const used = new Set(current.map((c) => c.metric));
  const i = spare.findIndex((s) => !used.has(s.metric));
  if (i < 0) return null;
  return { replacement: spare[i], spare: spare.filter((_, j) => j !== i) };
}

function inDomain(taskId: string, domainId: string, facts: QuestFacts): boolean {
  let d = facts.tasks[taskId]?.domainId ?? null;
  for (let hops = 0; d && hops < 10; hops++) {
    if (d === domainId) return true;
    d = facts.domainParent[d] ?? null;
  }
  return false;
}

export function objectiveValue(obj: { metric: QuestMetric; params: ObjectiveParams }, q: QuestWindow, facts: QuestFacts): number {
  const tz = facts.timezone;
  const from = t(localDayRange(q.periodStart, tz).start);
  const to = t(localDayRange(q.periodEnd, tz).end);
  const now = t(facts.now);
  const within = (iso: string | null) => !!iso && t(iso) >= from && t(iso) < to;
  const focusIn = (s: QuestFacts["sessions"][number]) => focusedMinutesInWindow(s, s.pauses, from, to, now);
  const p = obj.params;

  switch (obj.metric) {
    case "focus_minutes":
      return Math.round(facts.sessions.reduce((sum, s) => sum + focusIn(s), 0));
    case "complete_planned_tasks":
      return (p.taskIds ?? []).filter((id) => facts.tasks[id]?.status === "completed").length;
    case "complete_tasks":
      return Object.values(facts.tasks).filter((x) => x.status === "completed" && within(x.completedAt)).length;
    case "domain_minutes":
      return Math.round(facts.sessions.filter((s) => p.domainId && inDomain(s.task_id, p.domainId, facts)).reduce((sum, s) => sum + focusIn(s), 0));
    case "domain_sessions":
      return facts.sessions.filter(
        (s) => p.domainId && inDomain(s.task_id, p.domainId, facts) && within(s.ended_at) && focusStats(s, s.pauses).focusedMs >= 10 * 60_000,
      ).length;
    case "kept_commitments":
      return facts.commitments.filter((c) => c.kept && within(c.resolvedAt)).length;
    case "kept_commitment_rate": {
      const all = facts.commitments.filter((c) => within(c.resolvedAt));
      if (all.length < (p.min ?? 1)) return 0;
      return Math.round((all.filter((c) => c.kept).length / all.length) * 100);
    }
    case "days_within_capacity": {
      if (facts.capacity === null) return 0;
      const today = toLocalDate(facts.now, tz);
      let count = 0;
      for (let d = q.periodStart; d <= q.periodEnd && d < today; d = addLocalDays(d, 1, tz)) {
        if (!facts.plannedWorkDays.includes(new Date(`${d}T12:00:00Z`).getUTCDay())) continue;
        if (!overloadFor(dayPlannedMinutes(facts.blocks, localDayRange(d, tz)), facts.capacity)) count++;
      }
      return count;
    }
    case "early_session": {
      const cutoff = t(localDateTimeToIso(q.periodStart, p.before ?? "12:00", tz));
      return facts.sessions.some((s) => s.source === "timer" && t(s.started_at) >= from && t(s.started_at) < cutoff) ? 1 : 0;
    }
    case "booked_block":
      return facts.blocks.some(
        (b) =>
          t(b.created_at) >= t(q.createdAt) &&
          t(b.starts_at) > t(b.created_at) &&
          (t(b.ends_at) - t(b.starts_at)) / 60_000 >= (p.minMinutes ?? 30) &&
          b.status !== "cancelled",
      )
        ? 1
        : 0;
    case "started_session":
      return facts.sessions.some((s) => s.source === "timer" && t(s.started_at) >= t(q.createdAt)) ? 1 : 0;
  }
}

export function evaluateQuest(
  q: QuestWindow,
  objectives: { id: string; metric: QuestMetric; params: ObjectiveParams; target: number; completedAt: string | null }[],
  facts: QuestFacts,
) {
  const updates = objectives.map((o) => {
    const current = objectiveValue(o, q, facts);
    return { id: o.id, current, completedAt: o.completedAt ?? (current >= o.target ? facts.now : null) };
  });
  return { updates, cleared: updates.length > 0 && updates.every((u) => u.completedAt !== null) };
}
