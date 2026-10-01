"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActionRunner } from "@/hooks/use-action-runner";
import { cn } from "@/lib/utils";
import { clearMonthBudgetAction, setDefaultBudgetAction, setMonthBudgetAction } from "../actions/finance.actions";
import type { BudgetLine } from "../domain/budgets";
import { formatMoney, sumAmounts } from "../domain/money";
import { formatMonth, monthKey, shiftMonth, type MonthKey } from "../domain/period";
import { useFinance } from "./finance-provider";

const plain = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

/** Saves on blur or Enter, only when the text changed; Escape restores it. */
function AmountInput({
  id,
  label,
  initial,
  placeholder,
  disabled,
  autoFocus,
  onCommit,
}: {
  id: string;
  label: string;
  initial: string;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  onCommit: (value: string) => void;
}) {
  const [text, setText] = useState(initial);
  const commit = () => {
    if (text.trim() !== initial) onCommit(text.trim());
  };
  return (
    <Input
      id={id}
      aria-label={label}
      inputMode="decimal"
      autoComplete="off"
      value={text}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      className="h-8 w-full text-right tabular-nums"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setText(initial);
      }}
    />
  );
}

/**
 * Settings → 예산 (ADR 0033): a default budget per top-level expense category (from the current month on) and
 * one-month amounts for this or a later month. Past months are read-only. The 3-month average spending is a guide.
 */
export function BudgetSettings({
  month,
  currentMonth,
  lines,
  averages,
}: {
  month: MonthKey;
  currentMonth: MonthKey;
  lines: BudgetLine[];
  averages: Record<string, number>;
}) {
  const f = useFinance();
  const { run, pending } = useActionRunner();
  const [overriding, setOverriding] = useState<string | null>(null);
  const key = monthKey(month.year, month.month);
  const currentKey = monthKey(currentMonth.year, currentMonth.month);
  const isCurrent = key === currentKey;
  const editable = key >= currentKey;
  const byCategory = new Map(lines.map((l) => [l.categoryId, l]));
  const categories = f.categories
    .filter((c) => c.type === "EXPENSE" && c.parent_id === null && c.deleted_at === null)
    .filter((c) => c.is_active || byCategory.has(c.id));
  const total = sumAmounts(lines.map((l) => l.amount));
  const averageTotal = sumAmounts(categories.map((c) => averages[c.id] ?? 0));
  const href = (m: MonthKey) => `/finance/settings/budgets?month=${monthKey(m.year, m.month)}`;

  const saveDefault = (categoryId: string, value: string) =>
    run(() => setDefaultBudgetAction({ categoryId, amount: value }), {
      onSuccess: (r) => toast.success(`${Number(r.fromMonth.slice(5))}월부터 적용됩니다.`),
    });
  const saveMonth = (categoryId: string, value: string) => {
    setOverriding(null);
    if (value === "") return;
    run(() => setMonthBudgetAction({ categoryId, month: key, amount: value }), { success: `${month.month}월만 적용됩니다.` });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={href(shiftMonth(month, -1))} aria-label="이전 달" className="rounded-md p-1.5 hover:bg-muted">
          <ChevronLeft className="size-4" aria-hidden />
        </Link>
        <h2 className="min-w-28 text-center text-base font-semibold">{formatMonth(month)}</h2>
        <Link href={href(shiftMonth(month, 1))} aria-label="다음 달" className="rounded-md p-1.5 hover:bg-muted">
          <ChevronRight className="size-4" aria-hidden />
        </Link>
        {!isCurrent && (
          <Link href="/finance/settings/budgets" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
            이번 달로
          </Link>
        )}
        <p className="ml-auto text-xs text-muted-foreground">
          {editable ? (isCurrent ? "기본 예산은 이번 달부터 적용됩니다." : "기본 예산은 이번 달 화면에서 바꿀 수 있습니다.") : "지난 달 예산은 볼 수만 있습니다."}
        </p>
      </div>

      {lines.length === 0 && (
        <p className="rounded-lg border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
          카테고리마다 한 달 예산을 정하면 대시보드와 캘린더에서 진행률을 볼 수 있습니다. 입력칸의 회색 숫자는 지난 3개월 평균
          지출입니다.
        </p>
      )}

      <div role="table" aria-label={`${formatMonth(month)} 예산`} className="text-sm">
        <div role="row" className="hidden grid-cols-[minmax(0,1fr)_8rem_13rem_7rem] gap-3 border-b border-border pb-1.5 text-xs text-muted-foreground sm:grid">
          <span role="columnheader">카테고리</span>
          <span role="columnheader" className="text-right">기본 예산</span>
          <span role="columnheader">이 달</span>
          <span role="columnheader" className="text-right">3개월 평균</span>
        </div>
        {categories.map((c) => {
          const line = byCategory.get(c.id);
          const defaultAmount = line ? line.defaultAmount : null;
          const average = averages[c.id] ?? 0;
          const p = `bud-${c.id.slice(0, 8)}`;
          return (
            <div
              key={c.id}
              role="row"
              aria-label={c.name}
              className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-x-3 gap-y-1.5 border-b border-border py-2 sm:grid-cols-[minmax(0,1fr)_8rem_13rem_7rem]"
            >
              <span role="cell" className="truncate">
                {c.icon && <span aria-hidden className="mr-1.5">{c.icon}</span>}
                {c.name}
                {!c.is_active && <span className="ml-1.5 text-xs text-muted-foreground">(보관)</span>}
              </span>
              <span role="cell" className="text-right tabular-nums">
                {isCurrent ? (
                  <AmountInput
                    key={`${c.id}-${plain(defaultAmount)}`}
                    id={`${p}-default`}
                    label={`${c.name} 기본 예산`}
                    initial={plain(defaultAmount)}
                    placeholder={average > 0 ? String(Math.round(average)) : "없음"}
                    disabled={pending}
                    onCommit={(v) => saveDefault(c.id, v)}
                  />
                ) : defaultAmount !== null ? (
                  formatMoney(defaultAmount, f.currency)
                ) : (
                  <span className="text-muted-foreground">없음</span>
                )}
              </span>
              <span role="cell" className="col-span-2 flex items-center gap-2 sm:col-span-1">
                <span className="text-xs text-muted-foreground sm:hidden">이 달</span>
                {overriding === c.id ? (
                  <span className="w-28">
                    <AmountInput
                      id={`${p}-month`}
                      label={`${c.name} ${month.month}월 예산`}
                      initial={plain(line?.amount)}
                      placeholder="금액"
                      autoFocus
                      onCommit={(v) => saveMonth(c.id, v)}
                    />
                  </span>
                ) : line?.isOverride ? (
                  <>
                    <span className="font-medium tabular-nums">{formatMoney(line.amount, f.currency)}</span>
                    <span className="rounded border border-border px-1 text-[10px] text-muted-foreground">이 달만</span>
                    {editable && (
                      <Button
                        variant="ghost"
                        size="xs"
                        disabled={pending}
                        aria-label={`${c.name} ${month.month}월 금액 되돌리기`}
                        onClick={() =>
                          run(() => clearMonthBudgetAction({ categoryId: c.id, month: key }), { success: "기본 예산으로 되돌렸습니다." })
                        }
                      >
                        <RotateCcw aria-hidden />
                        되돌리기
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <span className={cn("text-xs", line ? "text-muted-foreground" : "text-muted-foreground/70")}>
                      {line ? "기본 적용" : "예산 없음"}
                    </span>
                    {editable && (
                      <Button variant="ghost" size="xs" aria-label={`${c.name} ${month.month}월만 변경`} onClick={() => setOverriding(c.id)}>
                        이 달만 변경
                      </Button>
                    )}
                  </>
                )}
                <span className="ml-auto text-xs text-muted-foreground tabular-nums sm:hidden">
                  평균 {average > 0 ? formatMoney(average, f.currency) : "—"}
                </span>
              </span>
              <span role="cell" className="hidden text-right text-muted-foreground tabular-nums sm:block">
                {average > 0 ? formatMoney(average, f.currency) : "—"}
              </span>
            </div>
          );
        })}
        <div role="row" className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 pt-2 font-medium sm:grid-cols-[minmax(0,1fr)_8rem_13rem_7rem]">
          <span role="rowheader">{month.month}월 전체 예산</span>
          <span role="cell" className="text-right tabular-nums">{formatMoney(total, f.currency)}</span>
          <span role="cell" className="hidden sm:block" />
          <span role="cell" className="hidden text-right text-muted-foreground tabular-nums sm:block">
            {averageTotal > 0 ? formatMoney(averageTotal, f.currency) : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}
