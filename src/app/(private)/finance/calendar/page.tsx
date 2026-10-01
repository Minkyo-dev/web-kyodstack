import type { Metadata } from "next";
import { requireUserOrRedirect } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isLocalDateString } from "@/features/scheduler/utils/timezone";
import { FinanceCalendar } from "@/features/finance/components/finance-calendar";
import { monthKey, parseMonthKey } from "@/features/finance/domain/period";
import { listTransactionsByDate } from "@/features/finance/queries/finance.queries";
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
  const [days, dayTransactions] = await Promise.all([
    getCalendarSummary(supabase, ctx.household.id, period),
    date ? listTransactionsByDate(supabase, ctx.household.id, date) : Promise.resolve(null),
  ]);

  return (
    <div className="p-4 md:p-6">
      <FinanceCalendar period={period} days={days} initialDate={date} initialDayTransactions={dayTransactions} />
    </div>
  );
}
