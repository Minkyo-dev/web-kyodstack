/**
 * Deterministic daily metrics (spec §3.5, §36, §59, §60). Pure: shared by the
 * server (reflection summary) and the client (live metrics bar).
 *
 * Definitions (v1). Keep docs/schema.md in sync:
 * - planned: Σ non-cancelled block time inside the window (skipped included)
 * - skipped: Σ skipped block time inside the window
 * - actual:  Σ focused minutes (wall − pauses, v2) of finished sessions inside the window
 *            (sessions and pauses crossing midnight are split)
 * - running: live focused minutes of the running session inside the window (UI only, never finalized)
 * - averageFocus: mean work-log focus_score of finished sessions that started in the window
 */
import { focusedMinutesInWindow, type PauseLike } from "./focus";

type BlockLike = { starts_at: string; ends_at: string; status: string };
type SessionLike = {
  started_at: string;
  ended_at: string | null;
  pauses: PauseLike[];
  work_log: { focus_score: number | null } | null;
};

export type DaySummary = {
  plannedMinutes: number;
  skippedMinutes: number;
  actualMinutes: number;
  runningMinutes: number;
  averageFocus: number | null;
};

function clippedMinutes(start: number, end: number, from: number, to: number) {
  const s = Math.max(start, from);
  const e = Math.min(end, to);
  return e > s ? (e - s) / 60_000 : 0;
}

export function computeDaySummary(input: {
  blocks: BlockLike[];
  sessions: SessionLike[];
  range: { start: string; end: string };
  now?: Date;
}): DaySummary {
  const from = new Date(input.range.start).getTime();
  const to = new Date(input.range.end).getTime();
  const now = (input.now ?? new Date()).getTime();

  let plannedMinutes = 0;
  let skippedMinutes = 0;
  for (const b of input.blocks) {
    if (b.status === "cancelled") continue;
    const m = clippedMinutes(new Date(b.starts_at).getTime(), new Date(b.ends_at).getTime(), from, to);
    plannedMinutes += m;
    if (b.status === "skipped") skippedMinutes += m;
  }

  let actualMinutes = 0;
  let runningMinutes = 0;
  const focus: number[] = [];
  for (const s of input.sessions) {
    const start = new Date(s.started_at).getTime();
    const m = focusedMinutesInWindow(s, s.pauses, from, to, now);
    if (s.ended_at === null) {
      runningMinutes += m;
      continue;
    }
    actualMinutes += m;
    const focusScore = s.work_log?.focus_score ?? null;
    if (focusScore !== null && start >= from && start < to) focus.push(focusScore);
  }

  return {
    plannedMinutes,
    skippedMinutes,
    actualMinutes,
    runningMinutes,
    averageFocus: focus.length ? Math.round((focus.reduce((a, b) => a + b, 0) / focus.length) * 10) / 10 : null,
  };
}

/** Elapsed "H:MM:SS" for the live timer. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
