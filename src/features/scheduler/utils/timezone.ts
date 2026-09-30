import { TZDate, tz } from "@date-fns/tz";
import { addDays, format, startOfWeek } from "date-fns";

/** Normalize any Date (including TZDate) to a UTC ISO string for storage/queries. */
export function toUtcIso(date: Date): string {
  return new Date(date.getTime()).toISOString();
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isLocalDateString(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

/** Midnight of a local calendar date (yyyy-MM-dd) in the given zone. */
export function startOfLocalDate(date: string, zone: string): TZDate {
  const [y, m, d] = date.split("-").map(Number);
  return new TZDate(y, m - 1, d, zone);
}

/** The local calendar date (yyyy-MM-dd) of an instant in the given zone. */
export function toLocalDate(instant: Date | string, zone: string): string {
  return format(new Date(instant), "yyyy-MM-dd", { in: tz(zone) });
}

export function todayLocalDate(zone: string, now: Date = new Date()): string {
  return toLocalDate(now, zone);
}

export function addLocalDays(date: string, days: number, zone: string): string {
  return toLocalDate(addDays(startOfLocalDate(date, zone), days), zone);
}

/** [start, end) instants of one local day. DST-safe: a day may be 23 or 25 hours. */
export function localDayRange(date: string, zone: string) {
  const start = startOfLocalDate(date, zone);
  const end = addDays(start, 1);
  return { start: toUtcIso(start), end: toUtcIso(end) };
}

/** Local week containing `date`, starting on `weekStartsOn` (0 = Sunday … 6 = Saturday). */
export function localWeek(date: string, zone: string, weekStartsOn: number) {
  const start = startOfWeek(startOfLocalDate(date, zone), {
    weekStartsOn: weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6,
  });
  const startDate = toLocalDate(start, zone);
  const days = Array.from({ length: 7 }, (_, i) => addLocalDays(startDate, i, zone));
  return {
    startDate,
    endDate: addLocalDays(startDate, 7, zone), // exclusive
    days,
  };
}

/** Local date (yyyy-MM-dd) + wall time (HH:mm) in `zone` → UTC ISO instant. */
export function localDateTimeToIso(date: string, time: string, zone: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return toUtcIso(new TZDate(y, m - 1, d, hh, mm, zone));
}

/** Wall-clock HH:mm of an instant in `zone`. */
export function toLocalTime(instant: Date | string, zone: string): string {
  return format(new Date(instant), "HH:mm", { in: tz(zone) });
}
