import type { Metadata } from "next";
import { requireUserOrRedirect } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isLocalDateString } from "@/features/scheduler/utils/timezone";
import { FinanceCalendar } from "@/features/finance/components/finance-calendar";
import { monthKey, monthRange, parseMonthKey } from "@/features/finance/domain/period";
import { getDailyBalances, listSubscriptions, listTransactionsByDate } from "@/features/finance/queries/finance.queries";
import { upcomingCharges } from "@/features/finance/domain/balances";
import { getFinanceContext } from "@/features/finance/queries/household.queries";
import { getCalendarSummary } from "@/features/finance/services/dashboard.service";

export const metadata: Metadata = { title: "가계부 캘린더", robots: { index: false } };

/** Calendar (spec §16–18, §28): daily totals for the month; a day's rows only when ?date= is restored from the URL. */
export default async function FinanceCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; date?: string }>;
}) {
  const user = await requireUserOrRedirect();
  const ctx = (await getFinanceContext(user.id))!;
  const sp = await searchParams;
  const [ty, tm] = ctx.today.split("-").map(Number);
  const dateParam = sp.date && isLocalDateString(sp.date) ? sp.date : null;
  const period = parseMonthKey(sp.month ?? dateParam?.slice(0, 7), { year: ty, month: tm });
  const date = dateParam?.startsWith(monthKey(period.year, period.month)) ? dateParam : null;

  const supabase = await createClient();
  // ADR 0032: balances from the previous month's last day (the opening) to the month end, or today if earlier.
  const { from: monthStart, to: monthEnd } = monthRange(period.year, period.month);
  const openingDay = new Date(Date.UTC(period.year, period.month - 1, 0)).toISOString().slice(0, 10);
  const loadTo = monthEnd < ctx.today ? monthEnd : ctx.today < openingDay ? openingDay : ctx.today;
  const [days, dayTransactions, balanceRows, plans] = await Promise.all([
    getCalendarSummary(supabase, ctx.household.id, period),
    date ? listTransactionsByDate(supabase, ctx.household.id, date) : Promise.resolve(null),
    getDailyBalances(supabase, ctx.household.id, openingDay, loadTo).catch(() => null),
    listSubscriptions(supabase, ctx.household.id).catch(() => []),
  ]);
  const assetFlow = balanceRows
    ? { rows: balanceRows, openingDay, monthStart, monthEnd, charges: upcomingCharges(plans, ctx.today, monthEnd) }
    : null;

  return (
    <div className="p-4 md:p-6">
      <FinanceCalendar
        period={period}
        days={days}
        initialDate={date}
        initialDayTransactions={dayTransactions}
        assetFlow={assetFlow}
      />
    </div>
  );
}
