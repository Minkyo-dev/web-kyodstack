"use client";

import { useMemo, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { monthGrid } from "@/lib/month-grid";
import { cn } from "@/lib/utils";
import type { DayTotals, Transaction } from "../domain/finance.types";
import { formatCompact, formatSigned } from "../domain/money";
import { formatMonth, formatShortDay, monthKey, shiftMonth, type MonthKey } from "../domain/period";
import { useFinance } from "./finance-provider";
import { DayDrawer } from "./day-drawer";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function compactSigned(value: number, currency: string) {
  return `${value > 0 ? "+" : "-"}${formatCompact(Math.abs(value), currency)}`;
}

/**
 * Month view of daily cash flow (spec §16–17): each day shows only its income and expense. Selecting a day opens the
 * Day Drawer without leaving the page; month and date live in the URL (?month=yyyy-MM&date=yyyy-MM-dd).
 */
export function FinanceCalendar({
  period,
  days,
  initialDate,
  initialDayTransactions,
}: {
  period: MonthKey;
  days: DayTotals[];
  initialDate: string | null;
  initialDayTransactions: Transaction[] | null;
}) {
  const f = useFinance();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [navigating, startNavigation] = useTransition();
  const month = monthKey(period.year, period.month);
  const selected = params.get("date") ?? null;
  const validSelected = selected && selected.startsWith(month) ? selected : null;

  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const grid = useMemo(() => monthGrid(month, 0), [month]);
  const empty = days.every((d) => d.income === 0 && d.expense === 0);

  const urlFor = (m: string, date?: string | null) => `${pathname}?month=${m}${date ? `&date=${date}` : ""}`;
  // Shallow URL update: no server round trip for opening/closing a day (Next syncs useSearchParams with history).
  const selectDate = (date: string | null) => window.history.pushState(null, "", urlFor(month, date));
  const goMonth = (delta: number) => {
    const next = shiftMonth(period, delta);
    startNavigation(() => router.push(urlFor(monthKey(next.year, next.month))));
  };
  const goToday = () => startNavigation(() => router.push(urlFor(f.today.slice(0, 7))));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="이전 달" onClick={() => goMonth(-1)}>
            <ChevronLeft aria-hidden />
          </Button>
          <h2 className="min-w-28 text-center text-base font-semibold" aria-live="polite">
            {formatMonth(period)}
          </h2>
          <Button variant="ghost" size="icon-sm" aria-label="다음 달" onClick={() => goMonth(1)}>
            <ChevronRight aria-hidden />
          </Button>
        </div>
        {!f.today.startsWith(month) && (
          <Button variant="outline" size="sm" onClick={goToday}>
            이번 달
          </Button>
        )}
        <p className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            <span className="text-income">+</span> 수입
          </span>
          <span>- 지출</span>
        </p>
      </div>

      <div
        role="grid"
        aria-label={`${formatMonth(period)} 일별 수입·지출`}
        aria-busy={navigating}
        className="overflow-hidden rounded-lg border border-border"
      >
        <div role="row" className="grid grid-cols-7 border-b border-border bg-muted/30">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              role="columnheader"
              className={cn("py-1.5 text-center text-xs font-medium text-muted-foreground", i === 0 && "text-destructive/80")}
            >
              {w}
            </div>
          ))}
        </div>
        {grid.map((week, r) => (
          <div key={r} role="row" className="grid grid-cols-7 border-b border-border last:border-b-0">
            {week.map(({ date, inMonth }) => {
              if (!inMonth) return <div key={date} role="gridcell" aria-hidden className="min-h-16 border-r border-border bg-muted/10 last:border-r-0 sm:min-h-20" />;
              const t = byDate.get(date);
              const isToday = date === f.today;
              const isSelected = date === validSelected;
              const label = `${formatShortDay(date)}, 수입 ${formatSigned(t?.income ?? 0, f.currency)}, 지출 ${formatSigned(-(t?.expense ?? 0), f.currency)}`;
              return (
                <div key={date} role="gridcell" className="border-r border-border last:border-r-0">
                  <button
                    type="button"
                    data-date={date}
                    aria-label={label}
                    aria-pressed={isSelected}
                    onClick={() => selectDate(date)}
                    className={cn(
                      "flex h-full min-h-16 w-full flex-col items-stretch gap-0.5 p-1 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none sm:min-h-20 sm:p-1.5",
                      isSelected && "bg-accent",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                        isToday && "bg-primary font-semibold text-primary-foreground",
                      )}
                    >
                      {Number(date.slice(8))}
                    </span>
                    <span className={cn("space-y-0.5 text-[10px] leading-tight sm:text-xs", navigating && "opacity-40")}>
                      {t && t.income !== 0 && (
                        <span className="block truncate text-income">
                          <span className="sm:hidden">{compactSigned(t.income, f.currency)}</span>
                          <span className="hidden sm:inline">{formatSigned(t.income, f.currency)}</span>
                        </span>
                      )}
                      {t && t.expense !== 0 && (
                        <span className="block truncate text-foreground/90">
                          <span className="sm:hidden">{compactSigned(-t.expense, f.currency)}</span>
                          <span className="hidden sm:inline">{formatSigned(-t.expense, f.currency)}</span>
                        </span>
                      )}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {empty && !navigating && (
        <p className="py-2 text-center text-sm text-muted-foreground">
          {formatMonth(period)}에 기록된 거래가 없습니다. 날짜를 눌러 첫 거래를 추가해 보세요.
        </p>
      )}

      <DayDrawer
        date={validSelected}
        totals={validSelected ? (byDate.get(validSelected) ?? null) : null}
        initialTransactions={validSelected && validSelected === initialDate ? initialDayTransactions : null}
        onClose={() => selectDate(null)}
      />
    </div>
  );
}
