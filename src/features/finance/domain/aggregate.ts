/**
 * Shapes the database aggregates (finance_daily_totals / finance_monthly_totals / finance_category_totals, which carry
 * the one cash-flow rule of spec §29) into what the dashboard and calendar show. Pure: no I/O.
 */
import type { Category, DayTotals, MonthTotals } from "./finance.types";
import { datesOfMonth } from "./period";
import { netOf, percentChange, savingRate, sumAmounts } from "./money";

type Totals = { income: number | string; expense: number | string };
export type DailyRow = Totals & { day: string };
export type MonthlyRow = Totals & { month: number };
export type CategoryRow = { category_id: string; expense: number | string };

export type Summary = { income: number; expense: number; net: number; savingRate: number | null };
export type Comparison = { incomeChange: number | null; expenseChange: number | null; netChange: number | null };
export type CategoryShare = {
  categoryId: string;
  name: string;
  icon: string | null;
  amount: number;
  percentage: number;
  previous: number;
  delta: number;
};

const totals = (income: number | string, expense: number | string) => {
  const i = Number(income);
  const e = Number(expense);
  return { income: i, expense: e, net: netOf(i, e) };
};

/** One entry per day of the month; days without transactions are zero. */
export function fillDays(year: number, month: number, rows: DailyRow[]): DayTotals[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  return datesOfMonth(year, month).map((date) => {
    const r = byDay.get(date);
    return { date, ...totals(r?.income ?? 0, r?.expense ?? 0) };
  });
}

/** Twelve entries, January to December. */
export function fillMonths(rows: MonthlyRow[]): MonthTotals[] {
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  return Array.from({ length: 12 }, (_, i) => {
    const r = byMonth.get(i + 1);
    return { month: i + 1, ...totals(r?.income ?? 0, r?.expense ?? 0) };
  });
}

export function summarize(rows: Totals[]): Summary {
  const income = sumAmounts(rows.map((r) => r.income));
  const expense = sumAmounts(rows.map((r) => r.expense));
  return { income, expense, net: netOf(income, expense), savingRate: savingRate(income, expense) };
}

export function compare(current: Summary, previous: Summary): Comparison {
  return {
    incomeChange: percentChange(current.income, previous.income),
    expenseChange: percentChange(current.expense, previous.expense),
    netChange: percentChange(current.net, previous.net),
  };
}

/**
 * Expense per top-level category, largest first, with its share of the period's expense and the change from the
 * previous period. A category that only appears in the previous period is listed with amount 0 so a drop is visible.
 */
export function categoryBreakdown(current: CategoryRow[], previous: CategoryRow[], categories: Category[]): CategoryShare[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const cur = new Map(current.map((r) => [r.category_id, Number(r.expense)]));
  const prev = new Map(previous.map((r) => [r.category_id, Number(r.expense)]));
  const total = sumAmounts([...cur.values()].filter((v) => v > 0));
  const ids = new Set([...cur.keys(), ...prev.keys()]);
  return [...ids]
    .map((id) => {
      const amount = cur.get(id) ?? 0;
      const before = prev.get(id) ?? 0;
      const category = byId.get(id);
      return {
        categoryId: id,
        name: category?.name ?? "알 수 없음",
        icon: category?.icon ?? null,
        amount,
        percentage: total > 0 && amount > 0 ? amount / total : 0,
        previous: before,
        delta: netOf(amount, before),
      };
    })
    .filter((c) => c.amount !== 0 || c.previous !== 0)
    .sort((a, b) => b.amount - a.amount || b.previous - a.previous);
}

/** "식비 > 장보기" for a subcategory, "식비" for a top-level one. */
export function categoryPath(categories: Category[], id: string | null): string | null {
  if (!id) return null;
  const c = categories.find((x) => x.id === id);
  if (!c) return null;
  const parent = c.parent_id ? categories.find((x) => x.id === c.parent_id) : null;
  return parent ? `${parent.name} > ${c.name}` : c.name;
}
