import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireUserOrRedirect } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import {
  CashFlowSection,
  CategorySection,
  ChartSkeleton,
  ListSkeleton,
  RecentSection,
  SummarySection,
  SummarySkeleton,
  type DashboardPeriod,
} from "@/features/finance/components/dashboard-sections";
import { AddTransactionButton } from "@/features/finance/components/panels";
import { formatMonth, monthKey, shiftMonth } from "@/features/finance/domain/period";
import { countTransactions } from "@/features/finance/queries/finance.queries";
import { getFinanceContext, getFinanceLookups } from "@/features/finance/queries/household.queries";

export const metadata: Metadata = { title: "가계부", robots: { index: false } };

function parsePeriod(sp: { mode?: string; year?: string; month?: string }, today: string): DashboardPeriod {
  const [ty, tm] = today.split("-").map(Number);
  const year = Number(sp.year);
  const validYear = Number.isInteger(year) && year >= 1900 && year <= 2999 ? year : ty;
  if (sp.mode === "yearly") return { mode: "yearly", year: validYear };
  const month = Number(sp.month);
  const validMonth = Number.isInteger(month) && month >= 1 && month <= 12 ? month : sp.year ? 1 : tm;
  return { mode: "monthly", key: { year: validYear, month: validMonth } };
}

const href = (p: DashboardPeriod) =>
  p.mode === "monthly" ? `/finance?mode=monthly&year=${p.key.year}&month=${p.key.month}` : `/finance?mode=yearly&year=${p.year}`;

/** Dashboard (spec §10–15): summary, cash-flow trend and category breakdown, each streaming behind its own skeleton. */
export default async function FinanceDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; year?: string; month?: string }>;
}) {
  const user = await requireUserOrRedirect();
  const ctx = (await getFinanceContext(user.id))!;
  const lookups = (await getFinanceLookups(user.id))!;
  const period = parsePeriod(await searchParams, ctx.today);
  const householdId = ctx.household.id;
  const currency = ctx.household.base_currency;
  const total = await countTransactions(await createClient(), householdId);

  const prev: DashboardPeriod =
    period.mode === "monthly" ? { mode: "monthly", key: shiftMonth(period.key, -1) } : { mode: "yearly", year: period.year - 1 };
  const next: DashboardPeriod =
    period.mode === "monthly" ? { mode: "monthly", key: shiftMonth(period.key, 1) } : { mode: "yearly", year: period.year + 1 };
  const [ty, tm] = ctx.today.split("-").map(Number);
  const anchorYear = period.mode === "monthly" ? period.key.year : period.year;
  const monthly: DashboardPeriod = {
    mode: "monthly",
    key: period.mode === "monthly" ? period.key : { year: anchorYear, month: anchorYear === ty ? tm : 1 },
  };
  const yearly: DashboardPeriod = { mode: "yearly", year: anchorYear };
  const label = period.mode === "monthly" ? formatMonth(period.key) : `${period.year}년`;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Link href={href(prev)} aria-label={period.mode === "monthly" ? "이전 달" : "이전 해"} className="rounded-md p-1.5 hover:bg-muted">
            <ChevronLeft className="size-4" aria-hidden />
          </Link>
          <h2 className="min-w-28 text-center text-base font-semibold">{label}</h2>
          <Link href={href(next)} aria-label={period.mode === "monthly" ? "다음 달" : "다음 해"} className="rounded-md p-1.5 hover:bg-muted">
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </div>
        <div role="group" aria-label="기간 단위" className="flex rounded-lg border border-border p-0.5">
          {[
            { p: monthly, text: "월간", on: period.mode === "monthly" },
            { p: yearly, text: "연간", on: period.mode === "yearly" },
          ].map(({ p, text, on }) => (
            <Link
              key={text}
              href={href(p)}
              aria-current={on ? "true" : undefined}
              className={cn("rounded-md px-3 py-1 text-sm", on ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {text}
            </Link>
          ))}
        </div>
        {period.mode === "monthly" && monthKey(period.key.year, period.key.month) !== ctx.today.slice(0, 7) && (
          <Link href="/finance" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
            이번 달로
          </Link>
        )}
      </div>

      {total === 0 ? (
        <div className="space-y-3 rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <p className="font-medium">아직 거래가 없습니다.</p>
          <p className="text-sm text-muted-foreground">첫 수입이나 지출을 기록하면 우리 집 현금 흐름이 여기에 나타납니다.</p>
          {lookups.accounts.some((a) => a.is_active) ? (
            <AddTransactionButton />
          ) : (
            <Link href="/finance/settings/accounts" className="inline-block text-sm underline underline-offset-4">
              먼저 계좌를 추가하세요
            </Link>
          )}
        </div>
      ) : (
        <>
          <Suspense key={`s-${href(period)}`} fallback={<SummarySkeleton />}>
            <SummarySection householdId={householdId} period={period} currency={currency} />
          </Suspense>
          <Suspense key={`c-${href(period)}`} fallback={<ChartSkeleton />}>
            <CashFlowSection householdId={householdId} period={period} currency={currency} />
          </Suspense>
          <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
            <Suspense key={`k-${href(period)}`} fallback={<ListSkeleton label="카테고리 불러오는 중" />}>
              <CategorySection householdId={householdId} period={period} currency={currency} categories={lookups.categories} />
            </Suspense>
            <Suspense fallback={<ListSkeleton label="최근 거래 불러오는 중" />}>
              <RecentSection householdId={householdId} />
            </Suspense>
          </div>
        </>
      )}
    </div>
  );
}
