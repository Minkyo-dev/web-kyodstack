/**
 * Calendar-date math for the date picker. Dates are local calendar dates ("yyyy-MM-dd") with no time
 * or zone; UTC arithmetic keeps them free of DST shifts.
 */
export type GridDay = { date: string; inMonth: boolean };

const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
const toKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
const parse = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d ?? 1);
};

/** Weeks (rows of 7) covering `month` ("yyyy-MM"), starting on `weekStartsOn` (0 = Sunday). */
export function monthGrid(month: string, weekStartsOn: number): GridDay[][] {
  const first = parse(`${month}-01`);
  const lead = (new Date(first).getUTCDay() - weekStartsOn + 7) % 7;
  const start = first - lead * DAY;
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const rows = Math.ceil((lead + daysInMonth) / 7);
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: 7 }, (_, c) => {
      const date = toKey(start + (r * 7 + c) * DAY);
      return { date, inMonth: date.startsWith(month) };
    }),
  );
}

export function addMonthsToKey(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export function moveDate(date: string, days: number): string {
  return toKey(parse(date) + days * DAY);
}

/** Inclusive bounds; string comparison works for "yyyy-MM-dd". */
export function isDisabledDate(date: string, bounds: { min?: string; max?: string }): boolean {
  return (bounds.min !== undefined && date < bounds.min) || (bounds.max !== undefined && date > bounds.max);
}
