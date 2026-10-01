import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { Account, Category } from "../domain/finance.types";
import { formatMoney, formatPercent, formatSigned, sumAmounts } from "../domain/money";
import { monthRange, shiftMonth, type MonthKey } from "../domain/period";
import { getAccountBalances, getPeriodBudgets, listRecentTransactions, listSubscriptions } from "../queries/finance.queries";
import { BUDGET_STATUS_LABEL, budgetMonths, budgetTotals, mergeBudgets, type BudgetedShare } from "../domain/budgets";
import { position, upcomingCharges } from "../domain/balances";
import {
  getCategoryBreakdown,
  getMonthlyCashFlow,
  getMonthlySummary,
  getYearlyCashFlow,
  getYearlySummary,
} from "../services/dashboard.service";
import { CashFlowChart, type FlowBucket } from "./cash-flow-chart";
import { AccountBalanceList } from "./account-balances";
import { RecentTransactions } from "./recent-transactions";

export type DashboardPeriod = { mode: "monthly"; key: MonthKey } | { mode: "yearly"; year: number };

const previousLabel = (p: DashboardPeriod) =>
  p.mode === "monthly" ? `${shiftMonth(p.key, -1).month}월` : `${p.year - 1}년`;

/** "↑ 3.2% 9월 대비" — direction by arrow and word, not color. */
function Change({ ratio, against }: { ratio: number | null; against: string }) {
  if (ratio === null) return <p className="text-xs text-muted-foreground">{against} 기록 없음</p>;
  const up = ratio > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <p className="flex items-center gap-0.5 text-xs text-muted-foreground tabular-nums">
      {ratio !== 0 && <Icon className="size-3.5" aria-hidden />}
      <span className="sr-only">{up ? "증가" : ratio < 0 ? "감소" : "변화 없음"}</span>
      {formatPercent(Math.abs(ratio))} <span>{against} 대비</span>
    </p>
  );
}

function Metric({ label, value, change }: { label: string; value: React.ReactNode; change?: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1 bg-background px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="space-y-0.5">
        <span className="block truncate text-xl font-semibold tabular-nums sm:text-2xl">{value}</span>
        {change}
      </dd>
    </div>
  );
}

export async function SummarySection({ householdId, period, currency }: { householdId: string; period: DashboardPeriod; currency: string }) {
  const supabase = await createClient();
  const { summary, comparison } =
    period.mode === "monthly"
      ? await getMonthlySummary(supabase, householdId, period.key)
      : await getYearlySummary(supabase, householdId, period.year);
  const against = previousLabel(period);
  return (
    <dl aria-label="요약" className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4">
      <Metric label="수입" value={formatMoney(summary.income, currency)} change={<Change ratio={comparison.incomeChange} against={against} />} />
      <Metric label="지출" value={formatMoney(summary.expense, currency)} change={<Change ratio={comparison.expenseChange} against={against} />} />
      <Metric
        label="순수입"
        value={<span className={cn(summary.net > 0 && "text-income")}>{formatSigned(summary.net, currency)}</span>}
        change={<Change ratio={comparison.netChange} against={against} />}
      />
      <Metric
        label="저축률"
        value={summary.savingRate === null ? "—" : formatPercent(summary.savingRate)}
        change={<p className="text-xs text-muted-foreground">{summary.savingRate === null ? "수입이 없어 계산할 수 없음" : "순수입 ÷ 수입"}</p>}
      />
    </dl>
  );
}

export async function CashFlowSection({ householdId, period, currency }: { householdId: string; period: DashboardPeriod; currency: string }) {
  const supabase = await createClient();
  let buckets: FlowBucket[];
  if (period.mode === "monthly") {
    const days = await getMonthlyCashFlow(supabase, householdId, period.key);
    buckets = days.map((d) => {
      const day = Number(d.date.slice(8));
      return { key: d.date, label: `${period.key.month}월 ${day}일`, tick: String(day), income: d.income, expense: d.expense, net: d.net };
    });
  } else {
    const months = await getYearlyCashFlow(supabase, householdId, period.year);
    buckets = months.map((m) => ({ key: String(m.month), label: `${period.year}년 ${m.month}월`, tick: `${m.month}월`, income: m.income, expense: m.expense, net: m.net }));
  }
  return (
    <CashFlowChart
      buckets={buckets}
      currency={currency}
      title={period.mode === "monthly" ? "일별 현금 흐름" : "월별 현금 흐름"}
      tickEvery={period.mode === "monthly" ? 5 : 1}
    />
  );
}

export async function CategorySection({
  householdId,
  period,
  currency,
  categories,
  today,
}: {
  householdId: string;
  period: DashboardPeriod;
  currency: string;
  categories: Category[];
  today: string;
}) {
  const supabase = await createClient();
  const [shares, budgets] = await Promise.all([
    getCategoryBreakdown(supabase, householdId, period, categories),
    // ADR 0033: budgets are optional here; without them the section is the plain breakdown.
    getPeriodBudgets(supabase, householdId, period, today).catch(() => null),
  ]);
  const rows = mergeBudgets(shares, budgets ?? new Map(), categories);
  const totals = budgetTotals(rows);
  const against = previousLabel(period);
  const label =
    period.mode === "monthly"
      ? `${period.key.month}월 예산`
      : `${period.year}년 예산${budgetMonths(period.year, today).length < 12 ? `(1–${budgetMonths(period.year, today).length}월)` : ""}`;
  return (
    <section aria-labelledby="category-breakdown" className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="category-breakdown" className="text-sm font-medium">
          카테고리별 지출
        </h2>
        <Link href="/finance/settings/budgets" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
          예산 설정
        </Link>
      </div>
      {budgets === null ? (
        <p role="alert" className="text-xs text-muted-foreground">예산을 불러오지 못했습니다.</p>
      ) : totals.total > 0 ? (
        <p className="text-xs text-muted-foreground tabular-nums" aria-label="예산 요약">
          {label} <span className="text-foreground">{formatMoney(totals.total, currency)}</span> 중{" "}
          <span className="text-foreground">{formatMoney(totals.spentBudgeted, currency)}</span> 사용 ({formatPercent(totals.ratio)}) ·{" "}
          {totals.remaining >= 0 ? (
            <>남은 <span className="text-foreground">{formatMoney(totals.remaining, currency)}</span></>
          ) : (
            <span className="font-medium text-destructive">초과 {formatMoney(-totals.remaining, currency)}</span>
          )}
          {totals.spentOutside > 0 && <> · 예산 외 지출 {formatMoney(totals.spentOutside, currency)}</>}
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">이 기간에 지출이 없습니다.</p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {rows.map((r) => (
            <li key={r.categoryId} className="space-y-1.5 py-2.5">
              <div className="flex items-baseline gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {r.icon && <span aria-hidden className="mr-1.5">{r.icon}</span>}
                  {r.name}
                </span>
                {r.status && r.status !== "ok" && (
                  <span
                    className={cn(
                      "rounded border px-1 text-[10px] font-medium",
                      r.status === "over" ? "border-destructive/50 text-destructive" : "border-border text-muted-foreground",
                    )}
                  >
                    {BUDGET_STATUS_LABEL[r.status]}
                  </span>
                )}
                <span className="font-medium tabular-nums">
                  {formatMoney(r.amount, currency)}
                  {r.budget !== null && <span className="font-normal text-muted-foreground"> / {formatMoney(r.budget, currency)}</span>}
                </span>
                {r.budget === null && (
                  <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">{formatPercent(r.percentage)}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <BudgetBar row={r} />
                <span className="w-36 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                  {r.remaining !== null
                    ? r.remaining >= 0
                      ? `남은 ${formatMoney(r.remaining, currency)}`
                      : `초과 ${formatMoney(-r.remaining, currency)}`
                    : r.previous === 0 && r.amount !== 0
                      ? `${against} 없음 · 예산 없음`
                      : `${formatSigned(r.delta, currency)} ${against} 대비`}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Budgeted: spent against the budget, the part over it hatched. Unbudgeted: share of the period's spending. */
function BudgetBar({ row }: { row: BudgetedShare }) {
  if (row.budget === null) {
    return (
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-expense" style={{ width: `${Math.max(0, row.percentage) * 100}%` }} />
      </div>
    );
  }
  const ratio = Math.max(0, row.ratio ?? 0);
  const within = ratio > 1 ? 1 / ratio : ratio;
  return (
    <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
      <div className={cn("h-full", row.status === "ok" ? "bg-primary" : "bg-expense")} style={{ width: `${within * 100}%` }} />
      {ratio > 1 && (
        <div
          className="h-full bg-destructive"
          style={{
            width: `${(1 - within) * 100}%`,
            backgroundImage: "repeating-linear-gradient(45deg, transparent 0 3px, rgb(0 0 0 / 0.35) 3px 5px)",
          }}
        />
      )}
    </div>
  );
}

/**
 * "재정 현황" (ADR 0032): balances at the end of the period (today while it is still running), net worth, liquid assets,
 * card debt and, for the current month, the subscription charges still to come.
 */
export async function PositionSection({
  householdId,
  period,
  currency,
  today,
  accounts,
}: {
  householdId: string;
  period: DashboardPeriod;
  currency: string;
  today: string;
  accounts: Account[];
}) {
  const end = period.mode === "monthly" ? monthRange(period.key.year, period.key.month).to : `${period.year}-12-31`;
  const asOf = end < today ? end : today;
  const current = period.mode === "monthly" && today.startsWith(end.slice(0, 7));
  const supabase = await createClient();
  let balances;
  try {
    balances = await getAccountBalances(supabase, householdId, asOf);
  } catch {
    return (
      <section aria-labelledby="position" className="space-y-2">
        <h2 id="position" className="text-sm font-medium">재정 현황</h2>
        <p role="alert" className="text-sm text-muted-foreground">잔액을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
      </section>
    );
  }
  const due = current ? upcomingCharges(await listSubscriptions(supabase, householdId), today, end) : [];
  const p = position(accounts, balances);
  const anyReconciled = accounts.some((a) => a.reconciled_on);
  const dueTotal = sumAmounts(due.map((c) => c.amount));
  const asOfLabel = asOf === today ? "오늘 기준" : `${Number(asOf.slice(5, 7))}/${Number(asOf.slice(8))} 기준`;

  return (
    <section aria-labelledby="position" className="space-y-3">
      <h2 id="position" className="flex items-baseline gap-2 text-sm font-medium">
        재정 현황 <span className="text-xs font-normal text-muted-foreground">{asOfLabel}</span>
      </h2>
      {anyReconciled ? (
        <dl aria-label="재정 현황 요약" className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border", current ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
          <Metric label="순자산" value={formatSigned(p.netWorth, currency)} change={<p className="text-xs text-muted-foreground">모든 계좌 잔액의 합</p>} />
          <Metric label="현금성 자산" value={formatMoney(p.liquid, currency)} change={<p className="text-xs text-muted-foreground">입출금·저축·현금</p>} />
          <Metric label="카드 대금" value={formatMoney(p.cardDebt, currency)} change={<p className="text-xs text-muted-foreground">갚을 돈</p>} />
          {current && (
            <Metric
              label="이번 달 남은 예정 지출"
              value={formatMoney(dueTotal, currency)}
              change={<p className="text-xs text-muted-foreground">정기 결제 {due.length}건</p>}
            />
          )}
        </dl>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
          계좌마다 현재 잔액을 한 번 입력하면 순자산과 잔액 흐름을 볼 수 있습니다. 아래 계좌의 ‘시작 잔액 설정’을 눌러 보세요.
        </p>
      )}
      <AccountBalanceList balances={balances} />
    </section>
  );
}

export async function RecentSection({ householdId }: { householdId: string }) {
  const rows = await listRecentTransactions(await createClient(), householdId, 6);
  return <RecentTransactions rows={rows} />;
}

export function SummarySkeleton() {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4" aria-label="요약 불러오는 중">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="space-y-2 bg-background px-4 py-3">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="space-y-2" aria-label="그래프 불러오는 중">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-[200px] w-full" />
    </div>
  );
}

export function ListSkeleton({ rows = 5, label }: { rows?: number; label: string }) {
  return (
    <div className="space-y-2" aria-label={label}>
      <Skeleton className="h-4 w-28" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}
