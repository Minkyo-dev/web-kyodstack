/**
 * Deterministic project/milestone progress (spec §29, §3.5). Pure: the caller supplies
 * each task's personal estimate (from the scheduler estimator) and its actual minutes.
 */
export type ProgressTask = {
  status: string;
  estimateMinutes: number;
  actualMinutes: number;
};

export type Progress = {
  total: number;
  completed: number;
  open: number;
  /** 0..1, by task count (cancelled tasks excluded). */
  ratio: number;
  actualMinutes: number;
  /** Σ over open tasks of max(estimate − already spent, 0). */
  remainingMinutes: number;
};

export function computeProgress(tasks: ProgressTask[]): Progress {
  const live = tasks.filter((t) => t.status !== "cancelled");
  const completed = live.filter((t) => t.status === "completed").length;
  let remainingMinutes = 0;
  let actualMinutes = 0;
  for (const t of live) {
    actualMinutes += t.actualMinutes;
    if (t.status !== "completed") remainingMinutes += Math.max(t.estimateMinutes - t.actualMinutes, 0);
  }
  return {
    total: live.length,
    completed,
    open: live.length - completed,
    ratio: live.length ? completed / live.length : 0,
    actualMinutes,
    remainingMinutes,
  };
}

/** Whole days from `today` to `target` (both yyyy-MM-dd); negative when past due. */
export function daysUntil(today: string, target: string): number {
  const a = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  const b = Date.UTC(+target.slice(0, 4), +target.slice(5, 7) - 1, +target.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

export type DueState = "none" | "overdue" | "due_soon" | "on_track" | "done";

/** Due state for a project or milestone; "due soon" means within 3 days. */
export function dueState(today: string, target: string | null, closed: boolean): DueState {
  if (closed) return "done";
  if (!target) return "none";
  const d = daysUntil(today, target);
  if (d < 0) return "overdue";
  if (d <= 3) return "due_soon";
  return "on_track";
}
