import { addMonthsToKey, monthGrid, moveDate } from "@/lib/month-grid";

/** "yyyy-MM" with a real month. */
export function isMonthKey(value: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(value)) return false;
  const m = Number(value.slice(5));
  return m >= 1 && m <= 12;
}

/**
 * The month view's range: whole weeks covering `month`, as local calendar dates (end exclusive), plus the
 * neighbouring months for navigation. Pure calendar math; the caller turns dates into instants in the user's zone.
 */
export function localMonth(month: string, weekStartsOn: number) {
  const rows = monthGrid(month, weekStartsOn);
  const last = rows[rows.length - 1][6].date;
  return {
    month,
    startDate: rows[0][0].date,
    endDate: moveDate(last, 1),
    prev: addMonthsToKey(month, -1),
    next: addMonthsToKey(month, 1),
    label: `${month.slice(0, 4)}년 ${Number(month.slice(5))}월`,
  };
}
export type LocalMonth = ReturnType<typeof localMonth>;
