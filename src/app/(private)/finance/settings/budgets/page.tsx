import type { Metadata } from "next";
import { requireUserOrRedirect } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BudgetSettings } from "@/features/finance/components/budget-settings";
import { monthRange, parseMonthKey, shiftMonth } from "@/features/finance/domain/period";
import { getCategoryTotals, getMonthBudgets } from "@/features/finance/queries/finance.queries";
import { getFinanceContext } from "@/features/finance/queries/household.queries";

export const metadata: Metadata = { title: "예산 설정", robots: { index: false } };

/** Settings → 예산 (ADR 0033). ?month=yyyy-MM, defaulting to the current month. */
export default async function FinanceBudgetsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requireUserOrRedirect();
  const ctx = (await getFinanceContext(user.id))!;
  const [ty, tm] = ctx.today.split("-").map(Number);
  const current = { year: ty, month: tm };
  const month = parseMonthKey((await searchParams).month, current);
  const supabase = await createClient();
  // The guide figure: average monthly spending over the three months before the viewed one.
  const from = monthRange(shiftMonth(month, -3).year, shiftMonth(month, -3).month).from;
  const to = monthRange(shiftMonth(month, -1).year, shiftMonth(month, -1).month).to;
  const [lines, totals] = await Promise.all([
    getMonthBudgets(supabase, ctx.household.id, monthRange(month.year, month.month).from),
    getCategoryTotals(supabase, ctx.household.id, from, to),
  ]);
  const averages = Object.fromEntries(totals.map((t) => [t.category_id, Math.round((Number(t.expense) / 3) * 100) / 100]));
  return <BudgetSettings key={`${month.year}-${month.month}`} month={month} currentMonth={current} lines={lines} averages={averages} />;
}
