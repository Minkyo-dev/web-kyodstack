/**
 * Calendar periods for the dashboard and calendar. Transaction dates are local calendar dates ("yyyy-MM-dd") already
 * in the household's timezone, so period math is plain date arithmetic.
 */
const pad = (n: number) => String(n).padStart(2, "0");

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export type MonthKey = { year: number; month: number };

export function monthKey(year: number, month: number): string {
  return `${year}-${pad(month)}`;
}

export function parseMonthKey(value: string | undefined, fallback: MonthKey): MonthKey {
  if (!value || !MONTH_RE.test(value)) return fallback;
  const [year, month] = value.split("-").map(Number);
  return { year, month };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Inclusive [from, to] dates of a month. */
export function monthRange(year: number, month: number): { from: string; to: string } {
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(daysInMonth(year, month))}` };
}

export function yearRange(year: number): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

export function shiftMonth({ year, month }: MonthKey, delta: number): MonthKey {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

/** Every date of the month, "yyyy-MM-dd". */
export function datesOfMonth(year: number, month: number): string[] {
  return Array.from({ length: daysInMonth(year, month) }, (_, i) => `${year}-${pad(month)}-${pad(i + 1)}`);
}

const MONTH_LABEL = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", timeZone: "UTC" });
const DAY_LABEL = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short", timeZone: "UTC" });
const SHORT_DAY_LABEL = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", timeZone: "UTC" });

/** "2026년 10월" */
export function formatMonth({ year, month }: MonthKey): string {
  return MONTH_LABEL.format(new Date(Date.UTC(year, month - 1, 1)));
}

const asUtc = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/** "2026년 10월 12일 (월)" */
export function formatDay(date: string): string {
  return DAY_LABEL.format(asUtc(date));
}

/** "10월 12일" */
export function formatShortDay(date: string): string {
  return SHORT_DAY_LABEL.format(asUtc(date));
}

/** "20:32" → "오후 8:32" */
export function formatTime(time: string | null): string | null {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  return new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(
    new Date(Date.UTC(2000, 0, 1, h, m)),
  );
}
