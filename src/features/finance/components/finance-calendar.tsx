"use client";

import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { monthGrid } from "@/lib/month-grid";
import { cn } from "@/lib/utils";
import type { Charge, DailyBalanceRow } from "../domain/balances";
import type { DayTotals, Transaction } from "../domain/finance.types";
import { formatCompact, formatSigned } from "../domain/money";
import { formatMonth, formatShortDay, monthKey, shiftMonth, type MonthKey } from "../domain/period";
import { AssetFlow } from "./asset-flow";
import { DayPanel } from "./day-panel";
import { useFinance } from "./finance-provider";
import { DayDrawer } from "./day-drawer";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

// The day panel sits beside the calendar from xl up; below that it stacks under it.
const WIDE_QUERY = "(min-width: 1280px)";
const subscribeWide = (onChange: () => void) => {
  const mql = window.matchMedia(WIDE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
};
function useWide() {
  return useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE_QUERY).matches, () => false);
}

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function compactSigned(value: number, currency: string) {
  return `${value > 0 ? "+" : "-"}${formatCompact(Math.abs(value), currency)}`;
}

/**
 * Month view of daily cash flow (spec §16–17): each day shows only its income and expense; month and date live in the
 * URL (?month=yyyy-MM&date=yyyy-MM-dd). Beside the day panel (ADR 0028) selecting a day shows it in the panel; without
 * the panel beside it (collapsed or a narrow screen) the Day Drawer opens instead.
 */
export function FinanceCalendar({
  period,
  days,
  initialDate,
  initialDayTransactions,
  assetFlow,
}: {
  period: MonthKey;
  days: DayTotals[];
  initialDate: string | null;
  initialDayTransactions: Transaction[] | null;
  /** ADR 0032: null when the balances could not be loaded (the rest of the calendar still works). */
  assetFlow: { rows: DailyBalanceRow[]; openingDay: string; monthStart: string; monthEnd: string; charges: Charge[] } | null;
}) {
  const f = useFinance();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [navigating, startNavigation] = useTransition();
  const wide = useWide();
  const [panelOpen, setPanelOpen] = useState(true);
  const panelBeside = panelOpen && wide;
  const month = monthKey(period.year, period.month);
  const selected = params.get("date") ?? null;
  const validSelected = selected && selected.startsWith(month) ? selected : null;
  // The panel always shows a day: the selected one, else today in this month, else the 1st.
  const panelDate = validSelected ?? (f.today.startsWith(month) ? f.today : `${month}-01`);

  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const grid = useMemo(() => monthGrid(month, 0), [month]);
  const empty = days.every((d) => d.income === 0 && d.expense === 0);

  const urlFor = (m: string, date?: string | null) => `${pathname}?month=${m}${date ? `&date=${date}` : ""}`;
  // Shallow URL update: no server round trip for opening/closing a day (Next syncs useSearchParams with history).
  const selectDate = (date: string | null) => window.history.pushState(null, "", urlFor(month, date));
  const drawerDate = panelBeside ? null : validSelected;
  const moveDay = (delta: -1 | 1) => {
    const next = shiftDate(panelDate, delta);
    if (next.startsWith(month)) selectDate(next);
    else startNavigation(() => router.push(urlFor(next.slice(0, 7), next)));
  };
  const goMonth = (delta: number) => {
    const next = shiftMonth(period, delta);
    startNavigation(() => router.push(urlFor(monthKey(next.year, next.month))));
  };
  const goToday = () => startNavigation(() => router.push(urlFor(f.today.slice(0, 7))));

  return (
    <div className={cn("grid items-start gap-4", panelOpen && "xl:grid-cols-[minmax(20rem,1fr)_minmax(0,1.8fr)]")}>
      <div className="@container min-w-0 space-y-3">
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
            {!panelOpen && (
              <Button variant="outline" size="sm" onClick={() => setPanelOpen(true)}>
                <PanelRightOpen aria-hidden />
                여러 건 입력
              </Button>
            )}
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
                if (!inMonth) return <div key={date} role="gridcell" aria-hidden className="min-h-16 border-r border-border bg-muted/10 last:border-r-0 @xl:min-h-20" />;
                const t = byDate.get(date);
                const isToday = date === f.today;
                const isSelected = date === (panelBeside ? panelDate : validSelected);
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
                        "flex h-full min-h-16 w-full flex-col items-stretch gap-0.5 p-1 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none @xl:min-h-20 @xl:p-1.5",
                        isSelected && "bg-accent ring-2 ring-ring ring-inset",
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
                      <span className={cn("space-y-0.5 text-[10px] leading-tight @xl:text-xs", navigating && "opacity-40")}>
                        {t && t.income !== 0 && (
                          <span className="block truncate text-income">
                            <span className="@xl:hidden">{compactSigned(t.income, f.currency)}</span>
                            <span className="hidden @xl:inline">{formatSigned(t.income, f.currency)}</span>
                          </span>
                        )}
                        {t && t.expense !== 0 && (
                          <span className="block truncate text-foreground/90">
                            <span className="@xl:hidden">{compactSigned(-t.expense, f.currency)}</span>
                            <span className="hidden @xl:inline">{formatSigned(-t.expense, f.currency)}</span>
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

        {assetFlow ? (
          <AssetFlow {...assetFlow} selected={panelBeside ? panelDate : validSelected} onSelect={selectDate} />
        ) : (
          <p role="alert" className="text-sm text-muted-foreground">자산 흐름을 불러오지 못했습니다.</p>
        )}

        {empty && !navigating && (
          <p className="py-2 text-center text-sm text-muted-foreground">
            {formatMonth(period)}에 기록된 거래가 없습니다.{" "}
            {panelBeside ? "날짜를 고르고 오른쪽 패널에 입력해 보세요." : "날짜를 눌러 첫 거래를 추가해 보세요."}
          </p>
        )}

      </div>

      {panelOpen && (
        <div className="min-w-0 xl:sticky xl:top-4">
          <DayPanel
            date={panelDate}
            totals={byDate.get(panelDate) ?? null}
            initial={panelDate === initialDate && initialDayTransactions ? { date: panelDate, rows: initialDayTransactions } : null}
            onMove={moveDay}
            onCollapse={() => setPanelOpen(false)}
          />
        </div>
      )}

      <DayDrawer
        date={drawerDate}
        totals={drawerDate ? (byDate.get(drawerDate) ?? null) : null}
        initialTransactions={drawerDate && drawerDate === initialDate ? initialDayTransactions : null}
        onClose={() => selectDate(null)}
      />
    </div>
  );
}
