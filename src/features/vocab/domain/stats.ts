/** Deterministic 단어장 stats over local calendar dates (spec §8). Dates are "YYYY-MM-DD" strings. */

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function weekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Cumulative due counts: by today (overdue included), within 1, 3 and 7 days. */
export function dueBuckets(dueDates: string[], today: string): { today: number; d1: number; d3: number; d7: number } {
  const within = (days: number) => dueDates.filter((d) => d <= addDays(today, days)).length;
  return { today: within(0), d1: within(1), d3: within(3), d7: within(7) };
}

/** Per-day due counts for the next `days` days; overdue cards are folded into today. */
export function forecast(dueDates: string[], today: string, days = 7): { date: string; count: number }[] {
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(today, i);
    return { date, count: dueDates.filter((d) => (i === 0 ? d <= date : d === date)).length };
  });
}

/** Consecutive local days with ≥ 1 review, ending today, or yesterday when today has none yet. */
export function streak(days: { date: string; reviews: number }[], today: string): { current: number; best: number } {
  const active = new Set(days.filter((d) => d.reviews > 0).map((d) => d.date));
  let current = 0;
  let cursor = active.has(today) ? today : addDays(today, -1);
  while (active.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }
  let best = 0;
  let run = 0;
  for (const date of [...active].sort()) {
    run = active.has(addDays(date, -1)) ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return { current, best };
}

export type HeatCell = { date: string; reviews: number; level: 0 | 1 | 2 | 3 | 4; future: boolean };

const levelFor = (reviews: number): HeatCell["level"] => (reviews <= 0 ? 0 : reviews < 10 ? 1 : reviews < 20 ? 2 : reviews < 30 ? 3 : 4);

/** `weeks` columns of Sunday→Saturday, the last one holding today. */
export function heatmapWeeks(days: { date: string; reviews: number }[], today: string, weeks = 12): HeatCell[][] {
  const counts = new Map(days.map((d) => [d.date, d.reviews]));
  const lastSunday = addDays(today, -weekday(today));
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, i) => {
      const date = addDays(lastSunday, (w - weeks + 1) * 7 + i);
      const reviews = date > today ? 0 : (counts.get(date) ?? 0);
      return { date, reviews, level: levelFor(reviews), future: date > today };
    }),
  );
}

/** Share of review-state cards not rated Again; null when there were none. */
export function recallRate(days: { studied: number; studiedOk: number }[]): number | null {
  const studied = days.reduce((a, d) => a + d.studied, 0);
  return studied ? days.reduce((a, d) => a + d.studiedOk, 0) / studied : null;
}
