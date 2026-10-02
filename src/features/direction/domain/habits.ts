import type { PauseLike } from "@/features/analytics/domain/stats.types";
import { focusStats } from "@/features/scheduler/utils/focus";
import type { ArchivableStatus, HabitRule } from "./direction.types";

type DueInput = { rule: HabitRule; status: ArchivableStatus; weekdays: number[] };

/** ISO weekday (1 = Monday … 7 = Sunday) of a local date string; calendar math only, no zone. */
export function isoWeekday(localDate: string): number {
  const [y, m, d] = localDate.split("-").map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return js === 0 ? 7 : js;
}

export function isDueOn(h: DueInput, localDate: string): boolean {
  return h.status === "active" && h.weekdays.includes(isoWeekday(localDate));
}

/** Only `check` habits are ticked by hand, and only on a day they are due. */
export function canCheckToday(h: DueInput, localDate: string): boolean {
  return h.rule === "check" && isDueOn(h, localDate);
}

type SessionInput = {
  source: string;
  started_at: string;
  ended_at: string | null;
  pauses: PauseLike[];
  task: { protocol_id: string | null } | null;
};

/** Focused minutes of finished timer sessions on tasks linked to the protocol (path status is irrelevant). */
export function focusMinutesFor(protocolId: string, sessions: SessionInput[]): number {
  let ms = 0;
  for (const s of sessions) {
    if (s.source !== "timer" || !s.ended_at || s.task?.protocol_id !== protocolId) continue;
    ms += focusStats(s, s.pauses).focusedMs;
  }
  return Math.round(ms / 60_000);
}

const DAY = ["", "월", "화", "수", "목", "금", "토", "일"];
export const WEEKDAY_LABEL = DAY;

export function formatWeekdays(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 7) return "매일";
  if (sorted.join() === "1,2,3,4,5") return "평일";
  return sorted.map((d) => DAY[d]).join(" ");
}

/** Run lengths that count as a routine streak mark (ADR 0037 §7). */
export const STREAK_MARKS = [7, 30, 100] as const;

function prevDate(localDate: string): string {
  const [y, m, d] = localDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/** The last day before `localDate` the routine is due on (current weekdays; none → every day). */
function prevDueDate(weekdays: number[], localDate: string): string {
  let d = prevDate(localDate);
  if (weekdays.length === 0) return d;
  for (let i = 0; i < 7 && !weekdays.includes(isoWeekday(d)); i++) d = prevDate(d);
  return d;
}

/**
 * Checks in a row on due days, by the routine's current weekdays. A check on a non-due day keeps the run going;
 * a due day without a check breaks it. Returns the best run and every time a run reached a mark.
 */
export function routineStreaks(
  weekdays: number[],
  checks: { local_date: string; created_at: string }[],
): { best: number; marks: { count: number; localDate: string; at: string }[] } {
  const sorted = [...checks].sort((a, b) => a.local_date.localeCompare(b.local_date));
  const marks: { count: number; localDate: string; at: string }[] = [];
  let run = 0;
  let best = 0;
  let prev: string | null = null;
  for (const c of sorted) {
    if (c.local_date === prev) continue;
    run = prev !== null && prev >= prevDueDate(weekdays, c.local_date) ? run + 1 : 1;
    prev = c.local_date;
    best = Math.max(best, run);
    if ((STREAK_MARKS as readonly number[]).includes(run)) marks.push({ count: run, localDate: c.local_date, at: c.created_at });
  }
  return { best, marks };
}
