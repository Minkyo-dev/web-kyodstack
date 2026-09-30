/** Today view sections (D3 spec §1), overload rule and overflow pre-selection (§3). Pure. */
import type { CalendarBlock } from "../domain/schedule.types";
import type { Task } from "../domain/task.types";
import type { SessionWithTask } from "../domain/work-session.types";
import { blockState } from "./block-state";

const t = (iso: string) => new Date(iso).getTime();
const MIN = 60_000;

export type TodaySections = {
  running: SessionWithTask | null;
  current: CalendarBlock[];
  missed: CalendarBlock[];
  next: CalendarBlock | null;
  later: CalendarBlock[];
  unscheduled: Task[];
  completed: Task[];
};

export function todaySections(input: {
  tasks: Task[];
  blocks: CalendarBlock[];
  sessions: SessionWithTask[];
  activeSession: SessionWithTask | null;
  now: Date;
  todayRange: { start: string; end: string };
  tagFilter: string[];
}): TodaySections {
  const nowMs = input.now.getTime();
  const match = (task: Pick<Task, "tags">) =>
    input.tagFilter.length === 0 || task.tags.some((g) => input.tagFilter.includes(g.id));
  const from = t(input.todayRange.start);
  const to = t(input.todayRange.end);
  const runningTaskId = input.activeSession?.task_id ?? null;

  const today = input.blocks
    .filter((b) => (b.status === "planned" || b.status === "missed") && t(b.starts_at) < to && t(b.ends_at) > from)
    .filter((b) => match(b.task) && b.task_id !== runningTaskId)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  const current: CalendarBlock[] = [];
  const missed: CalendarBlock[] = [];
  const upcoming: CalendarBlock[] = [];
  for (const b of today) {
    const state = blockState(b, input.sessions, input.now);
    if (state === "missed") missed.push(b);
    else if (state === "running") continue;
    else if (t(b.starts_at) <= nowMs && nowMs < t(b.ends_at)) {
      if (state === "planned" || state === "not_started") current.push(b);
    } else if (t(b.starts_at) > nowMs) upcoming.push(b);
  }

  const hasUpcomingBlock = new Set(
    input.blocks.filter((b) => b.status === "planned" && t(b.ends_at) > nowMs).map((b) => b.task_id),
  );
  // A task shown as a today block row (current, missed, next, later) isn't repeated under 미배정.
  const shownAsBlock = new Set([...current, ...missed, ...upcoming].map((b) => b.task_id));
  const open = input.tasks.filter((x) => x.status !== "completed" && x.status !== "cancelled" && match(x));
  return {
    running: input.activeSession,
    current,
    missed,
    next: upcoming[0] ?? null,
    later: upcoming.slice(1),
    unscheduled: open.filter((x) => !hasUpcomingBlock.has(x.id) && !shownAsBlock.has(x.id) && x.id !== runningTaskId),
    completed: input.tasks.filter((x) => x.status === "completed" && match(x)),
  };
}

/** Planned minutes of one day for the overload check: planned/completed/missed blocks, clipped. */
export function dayPlannedMinutes(
  blocks: { starts_at: string; ends_at: string; status: string }[],
  range: { start: string; end: string },
): number {
  const from = t(range.start);
  const to = t(range.end);
  return blocks
    .filter((b) => b.status === "planned" || b.status === "completed" || b.status === "missed")
    .reduce((sum, b) => sum + Math.max(0, Math.min(t(b.ends_at), to) - Math.max(t(b.starts_at), from)) / MIN, 0);
}

export function overloadFor(plannedMinutes: number, capacity: number | null): boolean {
  return capacity !== null && plannedMinutes > 1.3 * capacity && plannedMinutes - capacity >= 60;
}

export type OverflowCandidate = { id: string; minutes: number; priority: number; starts_at: string };

/** Least important (highest number) first, then the latest start, until planned fits the capacity. */
export function overflowSelection(candidates: OverflowCandidate[], plannedMinutes: number, capacity: number): string[] {
  const order = [...candidates].sort((a, b) => b.priority - a.priority || b.starts_at.localeCompare(a.starts_at));
  const picked: string[] = [];
  let remaining = plannedMinutes;
  for (const c of order) {
    if (remaining <= capacity) break;
    picked.push(c.id);
    remaining -= c.minutes;
  }
  return picked;
}
