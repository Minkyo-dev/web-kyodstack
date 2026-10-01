import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { Category, DayTotals, MonthTotals } from "../domain/finance.types";
import {
  categoryBreakdown,
  compare,
  fillDays,
  fillMonths,
  summarize,
  type CategoryShare,
  type Comparison,
  type Summary,
} from "../domain/aggregate";
import { monthRange, shiftMonth, yearRange, type MonthKey } from "../domain/period";
import { getCategoryTotals, getDailyTotals, getMonthlyTotals } from "../queries/finance.queries";

/** Dashboard query contract (spec §27), split per section so each can stream behind its own skeleton (spec §39). */

export type PeriodSummary = { summary: Summary; previous: Summary; comparison: Comparison };

export async function getMonthlySummary(supabase: SupabaseServerClient, householdId: string, period: MonthKey): Promise<PeriodSummary> {
  const cur = monthRange(period.year, period.month);
  const prevKey = shiftMonth(period, -1);
  const prev = monthRange(prevKey.year, prevKey.month);
  const [curRows, prevRows] = await Promise.all([
    getDailyTotals(supabase, householdId, cur.from, cur.to),
    getDailyTotals(supabase, householdId, prev.from, prev.to),
  ]);
  const summary = summarize(curRows);
  const previous = summarize(prevRows);
  return { summary, previous, comparison: compare(summary, previous) };
}

export async function getYearlySummary(supabase: SupabaseServerClient, householdId: string, year: number): Promise<PeriodSummary> {
  const [curRows, prevRows] = await Promise.all([
    getMonthlyTotals(supabase, householdId, year),
    getMonthlyTotals(supabase, householdId, year - 1),
  ]);
  const summary = summarize(curRows);
  const previous = summarize(prevRows);
  return { summary, previous, comparison: compare(summary, previous) };
}

export async function getMonthlyCashFlow(supabase: SupabaseServerClient, householdId: string, period: MonthKey): Promise<DayTotals[]> {
  const { from, to } = monthRange(period.year, period.month);
  return fillDays(period.year, period.month, await getDailyTotals(supabase, householdId, from, to));
}

export async function getYearlyCashFlow(supabase: SupabaseServerClient, householdId: string, year: number): Promise<MonthTotals[]> {
  return fillMonths(await getMonthlyTotals(supabase, householdId, year));
}

/** Expense by top-level category with the previous period's amount (month vs previous month, year vs previous year). */
export async function getCategoryBreakdown(
  supabase: SupabaseServerClient,
  householdId: string,
  period: { mode: "monthly"; key: MonthKey } | { mode: "yearly"; year: number },
  categories: Category[],
): Promise<CategoryShare[]> {
  let cur: { from: string; to: string };
  let prev: { from: string; to: string };
  if (period.mode === "monthly") {
    cur = monthRange(period.key.year, period.key.month);
    const p = shiftMonth(period.key, -1);
    prev = monthRange(p.year, p.month);
  } else {
    cur = yearRange(period.year);
    prev = yearRange(period.year - 1);
  }
  const [curRows, prevRows] = await Promise.all([
    getCategoryTotals(supabase, householdId, cur.from, cur.to),
    getCategoryTotals(supabase, householdId, prev.from, prev.to),
  ]);
  return categoryBreakdown(curRows, prevRows, categories);
}

/** Calendar (spec §28): one aggregate row per day, never the transactions themselves. */
export async function getCalendarSummary(supabase: SupabaseServerClient, householdId: string, period: MonthKey): Promise<DayTotals[]> {
  return getMonthlyCashFlow(supabase, householdId, period);
}
