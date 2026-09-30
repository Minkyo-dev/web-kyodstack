/**
 * Behavior stats v1 (D2 spec §2). Pure and deterministic: the page and the nightly snapshot call
 * the same function, and the LLM never computes these numbers.
 */
import { addLocalDays, localDayRange, toLocalDate } from "@/features/scheduler/utils/timezone";
import { focusedMinutesInWindow } from "@/features/scheduler/utils/focus";
import { median } from "@/features/scheduler/utils/estimator";
import { TASK_TYPES, type TaskType } from "@/features/classification/domain/classification.types";
import { dailyCapacity } from "./capacity";
import { STAT_MIN, STATS_VERSION, type StatInput, type Stats, type StatValue } from "../domain/stats.types";

const MIN = 60_000;
const t = (iso: string) => new Date(iso).getTime();
const round2 = (x: number) => Math.round(x * 100) / 100;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const stat = (values: number[], need: number): StatValue => ({
  value: values.length >= need ? Math.round(mean(values)!) : null,
  sampleCount: values.length,
  need,
});

export function calibrationScore(planned: number, actual: number): number {
  return Math.round(100 * Math.min(actual / planned, planned / actual));
}

/** Weekday (0 = Sunday) of a local calendar date, independent of zone. */
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

function workDays(from: string, toExclusive: string, planned: number[], tz: string): string[] {
  const out: string[] = [];
  for (let d = from; d < toExclusive; d = addLocalDays(d, 1, tz)) if (planned.includes(weekday(d))) out.push(d);
  return out;
}

type Session = StatInput["sessions"][number];
function focusedOnDay(sessions: Session[], date: string, tz: string, now: number, after?: number): number {
  const r = localDayRange(date, tz);
  const from = Math.max(t(r.start), after ?? -Infinity);
  return sessions.reduce((sum, s) => sum + focusedMinutesInWindow(s, s.pauses, from, t(r.end), now), 0);
}

export type Commitment = {
  blockId: string;
  taskId: string;
  kind: "move" | "final";
  slotStart: string;
  resolvedAt: string;
  score: number;
};

/** Every resolved commitment of every block (spec §2 Reliability). */
export type CommitmentInput = Pick<StatInput, "now" | "settings" | "blocks" | "revisions" | "sessions">;
export function commitments(input: CommitmentInput): Commitment[] {
  const lead = input.settings.commit_lead_minutes * MIN;
  const now = t(input.now);
  const out: Commitment[] = [];
  for (const b of input.blocks) {
    const revs = input.revisions
      .filter((r) => r.block_id === b.id)
      .sort((x, y) => x.created_at.localeCompare(y.created_at));
    let setAt = t(b.created_at);
    // Start changes (moved, or resized with a new start) resolve the previous slot.
    for (const r of revs) {
      if (!r.previous_starts_at || !r.new_starts_at || r.previous_starts_at === r.new_starts_at) continue;
      if (r.change_type !== "moved" && r.change_type !== "resized") continue;
      const prev = t(r.previous_starts_at);
      if (setAt <= prev - lead) {
        out.push({
          blockId: b.id,
          taskId: b.task_id,
          kind: "move",
          slotStart: r.previous_starts_at,
          resolvedAt: r.created_at,
          score: t(r.created_at) <= prev - lead ? 0.85 : 0.5,
        });
      }
      setAt = t(r.created_at);
    }
    const start = t(b.starts_at);
    if (setAt > start - lead) continue; // final slot not committed

    const closedAt = (status: string) =>
      status === "cancelled"
        ? (revs.find((r) => r.change_type === "cancelled")?.created_at ?? b.updated_at)
        : b.updated_at;
    if (b.status === "skipped" || b.status === "cancelled") {
      const at = closedAt(b.status);
      out.push({ blockId: b.id, taskId: b.task_id, kind: "final", slotStart: b.starts_at, resolvedAt: at, score: t(at) <= start - lead ? 0.85 : 0 });
      continue;
    }
    const first = input.sessions
      .filter(
        (s) =>
          s.schedule_block_id === b.id ||
          (s.task_id === b.task_id && t(s.started_at) >= start - 30 * MIN && t(s.started_at) < t(b.ends_at)),
      )
      .sort((x, y) => x.started_at.localeCompare(y.started_at))[0];
    if (first) {
      const late = t(first.started_at) - start;
      const score = late <= 0 ? 1 : late <= 15 * MIN ? 0.9 : late <= 30 * MIN ? 0.75 : 0.5;
      out.push({ blockId: b.id, taskId: b.task_id, kind: "final", slotStart: b.starts_at, resolvedAt: first.started_at, score });
    } else if (b.status === "completed") {
      out.push({ blockId: b.id, taskId: b.task_id, kind: "final", slotStart: b.starts_at, resolvedAt: b.ends_at, score: 1 });
    } else if (t(b.ends_at) <= now) {
      out.push({ blockId: b.id, taskId: b.task_id, kind: "final", slotStart: b.starts_at, resolvedAt: b.ends_at, score: 0 });
    }
  }
  return out;
}

function threeHourWindow(entries: { at: string; value: number }[], tz: string, pick: "mean" | "count") {
  const buckets = new Map<number, number[]>();
  for (const e of entries) {
    const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: tz }).format(new Date(e.at))) % 24;
    const w = Math.floor(hour / 3);
    buckets.set(w, [...(buckets.get(w) ?? []), e.value]);
  }
  let best: { w: number; score: number } | null = null;
  for (const [w, vs] of buckets) {
    if (vs.length < 3) continue;
    const score = pick === "mean" ? mean(vs)! : vs.length;
    if (!best || score > best.score) best = { w, score };
  }
  if (!best) return null;
  const pad = (h: number) => `${String(h).padStart(2, "0")}:00`;
  return { start: pad(best.w * 3), end: pad(best.w * 3 + 3) };
}

export function computeStats(input: StatInput): Stats {
  const tz = input.timezone;
  const now = t(input.now);
  const today = toLocalDate(input.now, tz);
  const since28 = addLocalDays(today, -28, tz);
  const since42 = addLocalDays(today, -42, tz);
  const since28Ms = t(localDayRange(since28, tz).start);
  const since42Ms = t(localDayRange(since42, tz).start);
  const min = input.settings.min_meaningful_minutes;
  const planned = input.settings.planned_work_days;

  // Calibration
  const calSamples: { type: string | null; score: number; ratio: number }[] = [];
  for (const c of input.calibration) {
    if (t(c.completed_at) < since28Ms || !(c.actualMinutes > 0)) continue;
    const before = c.firstSessionStart ? t(c.firstSessionStart) : Infinity;
    const P0 = c.planBlocks
      .filter((b) => b.status !== "cancelled" && t(b.created_at) < before)
      .reduce((sum, b) => sum + (t(b.ends_at) - t(b.starts_at)) / MIN, 0);
    const P = P0 > 0 ? P0 : (c.estimate ?? 0);
    if (!(P > 0)) continue;
    calSamples.push({ type: c.task_type, score: calibrationScore(P, c.actualMinutes), ratio: c.actualMinutes / P - 1 });
  }
  const bias = median(calSamples.map((s) => s.ratio));
  const typicalError = median(calSamples.map((s) => Math.abs(s.ratio)));
  const calOk = calSamples.length >= STAT_MIN.calibration;
  const byType: Stats["calibration"]["byType"] = {};
  for (const type of TASK_TYPES) {
    const xs = calSamples.filter((s) => s.type === type);
    if (xs.length === 0) continue;
    const st = stat(xs.map((s) => s.score), STAT_MIN.calibrationByType);
    const b = median(xs.map((s) => s.ratio));
    byType[type as TaskType] = { ...st, bias: st.value !== null && b !== null ? round2(b) : null };
  }

  // Reliability
  const all = commitments(input);
  const recent = all.filter((c) => t(c.resolvedAt) >= since28Ms && t(c.resolvedAt) <= now);
  const reliability = stat(recent.map((c) => c.score * 100), STAT_MIN.reliability);

  // Consistency
  // A brand-new account (no task yet) has no work days to judge.
  const first = input.firstActivityDate && input.firstActivityDate > since42 ? input.firstActivityDate : since42;
  const days = input.firstActivityDate ? workDays(first, today, planned, tz) : [];
  const success = days.filter((d) => focusedOnDay(input.sessions, d, tz, now) >= min);
  const consistency = {
    ...stat(days.map((d) => (success.includes(d) ? 100 : 0)), STAT_MIN.consistency),
    successDays: success.length,
    workDays: days.length,
  };

  // Recovery
  const taskStatus = new Map(input.tasks.map((x) => [x.id, x.status]));
  const recoveryScores: number[] = [];
  for (const c of all) {
    if (c.kind !== "final" || c.score !== 0) continue;
    const block = input.blocks.find((b) => b.id === c.blockId)!;
    const endMs = t(block.ends_at);
    if (endMs < since42Ms) continue;
    const eventDay = toLocalDate(block.ends_at, tz);
    const deadline = addLocalDays(eventDay, 14, tz);
    const own = input.sessions.filter((s) => s.task_id === c.taskId);
    let recovered: string | null = null;
    for (let d = eventDay; d <= deadline && d <= today; d = addLocalDays(d, 1, tz)) {
      if (focusedOnDay(own, d, tz, now, d === eventDay ? endMs : undefined) >= min) {
        recovered = d;
        break;
      }
    }
    if (recovered) {
      const between = workDays(addLocalDays(eventDay, 1, tz), addLocalDays(recovered, 1, tz), planned, tz).length;
      recoveryScores.push(between <= 1 ? 100 : between === 2 ? 75 : between === 3 ? 50 : 25);
    } else if (taskStatus.get(c.taskId) === "cancelled" || deadline < today) {
      recoveryScores.push(0);
    }
    // otherwise: young and unresolved → excluded
  }
  const recovery = stat(recoveryScores, STAT_MIN.recovery);

  // Patterns (last 28 days)
  const finished = input.sessions.filter((s) => s.ended_at && t(s.ended_at) >= since28Ms);
  const sessionMinutes = finished
    .map((s) => focusedMinutesInWindow(s, s.pauses, t(s.started_at), t(s.ended_at!), now))
    .filter((m) => m >= 1);
  const elapsed = finished.reduce((a, s) => a + (t(s.ended_at!) - t(s.started_at)) / MIN, 0);
  const focusedTotal = finished.reduce((a, s) => a + focusedMinutesInWindow(s, s.pauses, t(s.started_at), t(s.ended_at!), now), 0);
  const scores = finished.map((s) => s.focus_score).filter((x): x is number => x !== null);
  const moves = input.revisions.filter(
    (r) =>
      r.previous_starts_at &&
      r.new_starts_at &&
      r.previous_starts_at !== r.new_starts_at &&
      t(r.created_at) >= since28Ms,
  );

  // Practice domains (recent from sessions, total from input), rolled up to parents.
  const domainOf = new Map(input.tasks.map((x) => [x.id, x.practice_domain_id]));
  const recentBy = new Map<string, number>();
  for (const s of finished) {
    const d = domainOf.get(s.task_id);
    if (!d) continue;
    recentBy.set(d, (recentBy.get(d) ?? 0) + focusedMinutesInWindow(s, s.pauses, t(s.started_at), t(s.ended_at!), now));
  }
  const parentOf = new Map(input.domains.map((d) => [d.id, d.parent_id]));
  const rollUp = (own: Map<string, number>) => {
    const out = new Map<string, number>();
    for (const [id, m] of own) {
      for (let cur: string | null | undefined = id, g = 0; cur && g < 20; cur = parentOf.get(cur), g++) {
        out.set(cur, (out.get(cur) ?? 0) + m);
      }
    }
    return out;
  };
  const recentRolled = rollUp(recentBy);
  const totalRolled = rollUp(new Map(Object.entries(input.domainTotals)));

  return {
    version: STATS_VERSION,
    calibration: {
      ...stat(calSamples.map((s) => s.score), STAT_MIN.calibration),
      bias: calOk && bias !== null ? round2(bias) : null,
      typicalError: calOk && typicalError !== null ? round2(typicalError) : null,
      byType,
    },
    reliability,
    consistency,
    recovery,
    patterns: {
      medianSessionMinutes: sessionMinutes.length ? Math.round(median(sessionMinutes)!) : null,
      pauseRatio: elapsed > 0 ? round2(1 - focusedTotal / elapsed) : null,
      averageFocus: scores.length ? Math.round(mean(scores)! * 10) / 10 : null,
      dailyCapacityMinutes: dailyCapacity({ sessions: input.sessions, plannedWorkDays: planned, minMeaningfulMinutes: min, timezone: tz, now: input.now }),
      reliableWindow: threeHourWindow(recent.map((c) => ({ at: c.slotStart, value: c.score })), tz, "mean"),
      rescheduleWindow: threeHourWindow(moves.map((r) => ({ at: r.previous_starts_at!, value: 1 })), tz, "count"),
    },
    domains: input.domains
      .map((d) => ({
        id: d.id,
        name: d.name,
        parentId: d.parent_id,
        recentMinutes: Math.round(recentRolled.get(d.id) ?? 0),
        totalMinutes: Math.round(totalRolled.get(d.id) ?? 0),
      }))
      .filter((d) => d.recentMinutes > 0 || d.totalMinutes > 0)
      .sort((a, b) => b.recentMinutes - a.recentMinutes || b.totalMinutes - a.totalMinutes),
  };
}
