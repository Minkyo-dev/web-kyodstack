/**
 * Cron runs in UTC at a broad time; each job decides per user whether it's the
 * right local moment (spec §46). Never hard-code an offset (DST).
 */
import { addLocalDays, localWeek, todayLocalDate } from "@/features/scheduler/utils/timezone";

export function localHour(now: Date, timezone: string): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", hourCycle: "h23" }).format(now),
  );
}

/** True when the user's local hour is in [startHour, endHour). */
export function inLocalWindow(now: Date, timezone: string, startHour: number, endHour: number): boolean {
  const h = localHour(now, timezone);
  return h >= startHour && h < endHour;
}

/** The week that just ended, relative to the user's local "today" and week start day. */
export function previousWeekStart(now: Date, timezone: string, weekStartsOn: number): string {
  const current = localWeek(todayLocalDate(timezone, now), timezone, weekStartsOn).startDate;
  return addLocalDays(current, -7, timezone);
}

/** True on the first local day of the user's week (when last week's review is due). */
export function isFirstDayOfWeek(now: Date, timezone: string, weekStartsOn: number): boolean {
  const today = todayLocalDate(timezone, now);
  return localWeek(today, timezone, weekStartsOn).startDate === today;
}

/** Constant-time comparison for the job secret. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
