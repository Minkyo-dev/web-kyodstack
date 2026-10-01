import type { CategoryShare } from "./aggregate";
import type { Category } from "./finance.types";
import { fromCents, sumAmounts, toCents } from "./money";
import { daysInMonth } from "./period";

/**
 * Monthly category budgets (ADR 0033). SQL resolves each month's budget and the spending; this module merges the two
 * for the dashboard and the calendar: status, remaining, outside-budget spending, pace and the yearly range.
 */
export type BudgetLine = { categoryId: string; amount: number; isOverride: boolean; defaultAmount: number | null };
export type BudgetStatus = "ok" | "warning" | "over";
export const BUDGET_STATUS_LABEL: Record<BudgetStatus, string> = { ok: "정상", warning: "주의", over: "초과" };

/** Below 80 % is fine, 80–100 % is a warning, above 100 % is over. */
export function statusOf(ratio: number): BudgetStatus {
  if (ratio > 1) return "over";
  if (ratio >= 0.8) return "warning";
  return "ok";
}

export type BudgetedShare = CategoryShare & {
  budget: number | null;
  remaining: number | null;
  ratio: number | null;
  status: BudgetStatus | null;
};

/** Sum of several months' budgets per category (the yearly view). */
export function sumBudgets(months: BudgetLine[][]): Map<string, number> {
  const out = new Map<string, number>();
  for (const lines of months) for (const l of lines) out.set(l.categoryId, fromCents(toCents(out.get(l.categoryId) ?? 0) + toCents(l.amount)));
  return out;
}

/**
 * The category list with budgets merged in: budgeted categories (even with nothing spent) by ratio, highest first,
 * then the rest by amount as before.
 */
export function mergeBudgets(shares: CategoryShare[], budgets: Map<string, number>, categories: Category[]): BudgetedShare[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const rows: BudgetedShare[] = shares.map((s) => withBudget(s, budgets.get(s.categoryId) ?? null));
  for (const [categoryId, budget] of budgets) {
    if (rows.some((r) => r.categoryId === categoryId)) continue;
    const c = byId.get(categoryId);
    rows.push(
      withBudget({ categoryId, name: c?.name ?? "알 수 없음", icon: c?.icon ?? null, amount: 0, percentage: 0, previous: 0, delta: 0 }, budget),
    );
  }
  return rows.sort((a, b) => {
    if ((a.budget === null) !== (b.budget === null)) return a.budget === null ? 1 : -1;
    if (a.ratio !== null && b.ratio !== null && a.ratio !== b.ratio) return b.ratio - a.ratio;
    return b.amount - a.amount;
  });
}

function withBudget(s: CategoryShare, budget: number | null): BudgetedShare {
  if (budget === null) return { ...s, budget: null, remaining: null, ratio: null, status: null };
  const ratio = s.amount / budget;
  return { ...s, budget, remaining: fromCents(toCents(budget) - toCents(s.amount)), ratio, status: statusOf(ratio) };
}

export type BudgetTotals = { total: number; spentBudgeted: number; spentOutside: number; remaining: number; ratio: number };

export function budgetTotals(rows: BudgetedShare[]): BudgetTotals {
  const budgeted = rows.filter((r) => r.budget !== null);
  const total = sumAmounts(budgeted.map((r) => r.budget!));
  const spentBudgeted = sumAmounts(budgeted.map((r) => r.amount));
  const spentOutside = sumAmounts(rows.filter((r) => r.budget === null && r.amount > 0).map((r) => r.amount));
  return {
    total,
    spentBudgeted,
    spentOutside,
    remaining: fromCents(toCents(total) - toCents(spentBudgeted)),
    ratio: total > 0 ? spentBudgeted / total : 0,
  };
}

export type Pace = { expected: number; delta: number; perDay: number; remainingDays: number; elapsedDays: number };

/**
 * Only for the month containing `today`: the even-spending amount by the end of today, how far ahead or behind the
 * budgeted spending is, and what is left per day (today included).
 */
export function paceOf(total: number, spentBudgeted: number, today: string, year: number, month: number): Pace | null {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  if (!today.startsWith(prefix)) return null;
  const days = daysInMonth(year, month);
  const elapsedDays = Number(today.slice(8, 10));
  const remainingDays = days - elapsedDays + 1;
  const expected = fromCents(Math.round((toCents(total) * elapsedDays) / days));
  const left = Math.max(0, toCents(total) - toCents(spentBudgeted));
  return {
    expected,
    delta: fromCents(toCents(spentBudgeted) - toCents(expected)),
    perDay: fromCents(Math.floor(left / remainingDays)),
    remainingDays,
    elapsedDays,
  };
}

/** Months counted in a yearly budget: January to the current month this year, all twelve for a past year. */
export function budgetMonths(year: number, today: string): string[] {
  const ty = Number(today.slice(0, 4));
  if (year > ty) return [];
  const last = year === ty ? Number(today.slice(5, 7)) : 12;
  return Array.from({ length: last }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}-01`);
}
