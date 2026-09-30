/**
 * Focused time (actual minutes v2): wall time minus pause intervals. Pure; shared by
 * the focus bar, the work summary and the day/week metrics. Spec: focus-flow design §1.
 */
import { MAX_SESSION_MINUTES } from "../domain/work-session.types";

export type PauseLike = { paused_at: string; resumed_at: string | null };
export type FocusStats = { elapsedMs: number; pausedMs: number; focusedMs: number; paused: boolean };

const MIN = 60_000;
const at = (iso: string) => new Date(iso).getTime();
const overlap = (s: number, e: number, from: number, to: number) => Math.max(0, Math.min(e, to) - Math.max(s, from));

export function focusStats(
  session: { started_at: string; ended_at: string | null },
  pauses: PauseLike[],
  now: Date = new Date(),
): FocusStats {
  const start = at(session.started_at);
  const end = session.ended_at ? at(session.ended_at) : now.getTime();
  const elapsedMs = Math.max(0, end - start);
  let pausedMs = 0;
  let paused = false;
  for (const p of pauses) {
    if (p.resumed_at === null && session.ended_at === null) paused = true;
    const pe = p.resumed_at ? at(p.resumed_at) : end;
    pausedMs += overlap(at(p.paused_at), pe, start, end);
  }
  pausedMs = Math.min(pausedMs, elapsedMs);
  return { elapsedMs, pausedMs, focusedMs: elapsedMs - pausedMs, paused };
}

/** Focused minutes of one session inside [from, to). A running session counts up to `now`. */
export function focusedMinutesInWindow(
  session: { started_at: string; ended_at: string | null },
  pauses: PauseLike[],
  from: number,
  to: number,
  now: number,
): number {
  const start = at(session.started_at);
  const end = session.ended_at ? at(session.ended_at) : now;
  const lo = Math.max(start, from);
  const hi = Math.min(end, to);
  if (hi <= lo) return 0;
  let paused = 0;
  for (const p of pauses) paused += overlap(at(p.paused_at), p.resumed_at ? at(p.resumed_at) : end, lo, hi);
  return Math.max(0, hi - lo - paused) / MIN;
}

/** "Planned" for one session: the linked block, else what is left of the estimate. */
export function sessionPlanMinutes(input: {
  block: { starts_at: string; ends_at: string } | null;
  estimateMinutes: number | null;
  priorActualMinutes: number;
}): number | null {
  if (input.block) return (at(input.block.ends_at) - at(input.block.starts_at)) / MIN;
  if (input.estimateMinutes === null) return null;
  return Math.max(0, input.estimateMinutes - input.priorActualMinutes);
}

export function remainingMinutes(estimateMinutes: number | null, actualMinutes: number): number | null {
  if (estimateMinutes === null) return null;
  return Math.max(0, Math.round(estimateMinutes - actualMinutes));
}

/** Block length when dropping a partially done task: the remainder, rounded up to 5, at least the minimum block. */
export function partialDropMinutes(remaining: number | null, minBlockMinutes: number): number | null {
  if (remaining === null || remaining <= 0) return null;
  return Math.max(minBlockMinutes, Math.ceil(remaining / 5) * 5);
}

export function describeDifference(plannedMinutes: number, actualMinutes: number): string {
  const diff = Math.round(actualMinutes - plannedMinutes);
  if (diff === 0) return "계획과 같음";
  if (diff < 0) return `${-diff}분 덜 걸림`;
  const pct = plannedMinutes > 0 ? ` (${Math.round((diff / plannedMinutes) * 100)}%)` : "";
  return `+${diff}분${pct} 더 걸림`;
}

export function describeRemaining(plannedMinutes: number, focusedMinutes: number): string {
  const left = Math.round(plannedMinutes - focusedMinutes);
  return left >= 0 ? `${left}분 남음` : `${-left}분 초과`;
}

/** A timer past the 16 h sanity bound must be stopped with a corrected end time first. */
export function sessionTooLong(startedAt: string, now: Date): boolean {
  return now.getTime() - at(startedAt) > MAX_SESSION_MINUTES * MIN;
}

/**
 * Continue Later state for the task list: worked on, unfinished, nothing planned ahead and
 * not running right now. Null when the task isn't partial.
 */
export function partialTask(input: {
  status: string;
  actualMinutes: number;
  hasUpcomingBlock: boolean;
  running: boolean;
  estimateMinutes: number | null;
  minBlockMinutes: number;
}): { actualMinutes: number; remainingMinutes: number | null; dropMinutes: number | null } | null {
  if (input.status !== "in_progress" || input.actualMinutes <= 0 || input.hasUpcomingBlock || input.running) {
    return null;
  }
  const left = remainingMinutes(input.estimateMinutes, input.actualMinutes);
  return {
    actualMinutes: input.actualMinutes,
    remainingMinutes: left,
    dropMinutes: partialDropMinutes(left, input.minBlockMinutes),
  };
}
