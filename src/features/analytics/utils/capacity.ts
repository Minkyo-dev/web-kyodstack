/** Typical daily capacity (D2 spec §2, D3 spec §3): median focused minutes of the last 28 days'
 * planned work days with at least the meaningful minimum. Today is excluded (not finished). Pure. */
import { addLocalDays, localDayRange, toLocalDate } from "@/features/scheduler/utils/timezone";
import { focusedMinutesInWindow, type PauseLike } from "@/features/scheduler/utils/focus";
import { median } from "@/features/scheduler/utils/estimator";

export function dailyCapacity(input: {
  sessions: { started_at: string; ended_at: string | null; pauses: PauseLike[] }[];
  plannedWorkDays: number[];
  minMeaningfulMinutes: number;
  timezone: string;
  now: string;
}): number | null {
  const tz = input.timezone;
  const nowMs = new Date(input.now).getTime();
  const today = toLocalDate(input.now, tz);
  const days: number[] = [];
  for (let d = addLocalDays(today, -28, tz); d < today; d = addLocalDays(d, 1, tz)) {
    if (!input.plannedWorkDays.includes(new Date(`${d}T12:00:00Z`).getUTCDay())) continue;
    const r = localDayRange(d, tz);
    const from = new Date(r.start).getTime();
    const to = new Date(r.end).getTime();
    const m = input.sessions.reduce((sum, s) => sum + focusedMinutesInWindow(s, s.pauses, from, to, nowMs), 0);
    if (m >= input.minMeaningfulMinutes) days.push(m);
  }
  return days.length ? Math.round(median(days)!) : null;
}
