"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { BUDGET_STATUS_LABEL, type BudgetTotals, type BudgetedShare, type Pace } from "../domain/budgets";
import { formatMoney, formatPercent } from "../domain/money";
import { useFinance } from "./finance-provider";

export type CalendarBudget = {
  when: "past" | "current" | "future";
  month: number;
  rows: BudgetedShare[];
  totals: BudgetTotals;
  pace: Pace | null;
};

/**
 * The month's budget under the calendar (ADR 0033). This month: progress against the even-spending marker, how far
 * ahead or behind, what is left per day, and the categories that need attention. A past month shows the result; a
 * future month only the budget.
 */
export function BudgetCard({ budget }: { budget: CalendarBudget | null | "error" }) {
  const f = useFinance();
  if (budget === "error") return <p role="alert" className="text-sm text-muted-foreground">예산을 불러오지 못했습니다.</p>;
  if (!budget || budget.totals.total === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        예산을 정하면 여기서 진행률을 볼 수 있습니다.{" "}
        <Link href="/finance/settings/budgets" className="underline underline-offset-4">
          예산 설정
        </Link>
      </p>
    );
  }
  const { totals, pace, rows, when } = budget;
  const attention = rows.filter((r) => r.status === "warning" || r.status === "over").slice(0, 3);
  const fill = Math.min(1, totals.ratio);
  const marker = pace && totals.total > 0 ? Math.min(1, pace.expected / totals.total) : null;

  return (
    <section aria-labelledby="budget-card" className="space-y-2.5 rounded-lg border border-border p-3">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="budget-card" className="text-sm font-medium">
          {when === "current" ? "이번 달 예산" : `${budget.month}월 예산`}
        </h3>
        <p className="text-sm tabular-nums">
          {when === "future" ? (
            <span className="font-semibold">{formatMoney(totals.total, f.currency)}</span>
          ) : (
            <>
              <span className="font-semibold">{formatMoney(totals.spentBudgeted, f.currency)}</span>
              <span className="text-muted-foreground"> / {formatMoney(totals.total, f.currency)} ({formatPercent(totals.ratio)})</span>
            </>
          )}
        </p>
      </header>

      {when !== "future" && (
        <div className="space-y-1">
          <div className="relative h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className={cn("h-full rounded-full", totals.ratio > 1 ? "bg-destructive" : totals.ratio >= 0.8 ? "bg-expense" : "bg-primary")} style={{ width: `${fill * 100}%` }} />
            {marker !== null && <div className="absolute inset-y-0 w-0.5 bg-foreground/70" style={{ left: `calc(${marker * 100}% - 1px)` }} />}
          </div>
          {pace && (
            <p className="text-xs text-muted-foreground tabular-nums">
              {pace.delta > 0 ? (
                <>오늘까지 적정 사용량보다 <span className="font-medium text-foreground">{formatMoney(pace.delta, f.currency)} 더</span> 썼습니다.</>
              ) : pace.delta < 0 ? (
                <>오늘까지 적정 사용량보다 {formatMoney(-pace.delta, f.currency)} 덜 썼습니다.</>
              ) : (
                <>오늘까지 적정 사용량과 같습니다.</>
              )}{" "}
              남은 {pace.remainingDays}일 동안 하루 {formatMoney(pace.perDay, f.currency)}.
            </p>
          )}
          {when === "past" && (
            <p className="text-xs text-muted-foreground tabular-nums">
              {totals.remaining >= 0 ? `예산보다 ${formatMoney(totals.remaining, f.currency)} 적게 썼습니다.` : `예산을 ${formatMoney(-totals.remaining, f.currency)} 초과했습니다.`}
            </p>
          )}
        </div>
      )}

      {when !== "future" &&
        (attention.length > 0 ? (
          <ul className="space-y-1 text-xs" aria-label="주의할 카테고리">
            {attention.map((r) => (
              <li key={r.categoryId} className="flex items-center gap-2">
                <span className={cn("rounded border px-1 text-[10px] font-medium", r.status === "over" ? "border-destructive/50 text-destructive" : "border-border text-muted-foreground")}>
                  {BUDGET_STATUS_LABEL[r.status!]}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {r.icon && <span aria-hidden className="mr-1">{r.icon}</span>}
                  {r.name}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {formatMoney(r.amount, f.currency)} / {formatMoney(r.budget!, f.currency)} ({formatPercent(r.ratio!)})
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">모든 카테고리가 예산 안입니다.</p>
        ))}
    </section>
  );
}
