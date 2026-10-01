"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, PanelRightClose } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { TRANSACTION_TYPE_LABEL, type DayTotals, type Transaction } from "../domain/finance.types";
import { formatDay } from "../domain/period";
import { Amount, TransactionAmount } from "./amount";
import { BulkEntryGrid } from "./bulk-entry";
import { useFinance } from "./finance-provider";
import { TransactionSheet } from "./panels";
import { useTransactionText } from "./transaction-detail";
import { useDayTransactions } from "./use-day-transactions";

const PANEL_COLUMNS = ["date", "type", "amount", "category", "account", "merchant"] as const;
// Income first, then spending, then money moved between accounts (the Day Drawer's order).
const ORDER: Record<string, number> = { INCOME: 0, EXPENSE: 1, REFUND: 1, TRANSFER: 2, ADJUSTMENT: 2 };

function DayRow({ tx, onOpen }: { tx: Transaction; onOpen: () => void }) {
  const f = useFinance();
  const text = useTransactionText(tx);
  return (
    <tr
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`${text.title} 상세`}
      className="cursor-pointer border-b last:border-b-0 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
    >
      <td className="px-2 py-2 text-xs text-muted-foreground">
        {TRANSACTION_TYPE_LABEL[tx.type as keyof typeof TRANSACTION_TYPE_LABEL] ?? tx.type}
      </td>
      <td className="max-w-0 truncate px-2 py-2 font-medium">{text.title}</td>
      <td className="max-w-0 truncate px-2 py-2 text-muted-foreground">{text.subtitle}</td>
      <td className="truncate px-2 py-2 text-muted-foreground">{f.memberName(tx.paid_by_user_id) ?? ""}</td>
      <td className="px-2 py-2 text-right whitespace-nowrap">
        <TransactionAmount tx={tx} className="font-medium" />
      </td>
    </tr>
  );
}

/**
 * The calendar's right panel (ADR 0028): everything that happened on the selected day — its totals and every income,
 * expense and transfer, each opening its detail (edit, delete) — with the entry grid underneath for more rows.
 */
export function DayPanel({
  date,
  totals,
  initial,
  onMove,
  onCollapse,
}: {
  date: string;
  totals: DayTotals | null;
  initial: { date: string; rows: Transaction[] } | null;
  onMove: (delta: -1 | 1) => void;
  onCollapse: () => void;
}) {
  const f = useFinance();
  const { rows, failed, reload } = useDayTransactions(date, initial);
  const [open, setOpen] = useState<Transaction | null>(null);
  const sorted = rows ? [...rows].sort((a, b) => (ORDER[a.type] ?? 3) - (ORDER[b.type] ?? 3)) : null;

  return (
    <section aria-labelledby="day-panel-title" className="min-w-0 rounded-lg border bg-card shadow-xs">
      <header className="flex items-center gap-1 border-b px-3 py-2">
        <Button variant="ghost" size="icon-sm" aria-label="전날" onClick={() => onMove(-1)}>
          <ChevronLeft aria-hidden />
        </Button>
        <h2 id="day-panel-title" className="min-w-0 flex-1 truncate text-center text-sm font-semibold">
          {formatDay(date)}
        </h2>
        <Button variant="ghost" size="icon-sm" aria-label="다음 날" onClick={() => onMove(1)}>
          <ChevronRight aria-hidden />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="일별 내역 패널 접기" onClick={onCollapse}>
          <PanelRightClose aria-hidden />
        </Button>
      </header>

      <dl className="grid grid-cols-3 border-b text-center" aria-label="이날 합계">
        {[
          { label: "수입", value: totals?.income ?? 0 },
          { label: "지출", value: -(totals?.expense ?? 0) },
          { label: "순수입", value: totals?.net ?? 0 },
        ].map((m, i) => (
          <div key={m.label} className={cn("space-y-0.5 px-2 py-2.5", i > 0 && "border-l")}>
            <dt className="text-xs text-muted-foreground">{m.label}</dt>
            <dd className="text-sm font-semibold">
              <Amount value={m.value} currency={f.currency} />
            </dd>
          </div>
        ))}
      </dl>

      <div className="space-y-2 p-3">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground">
          이날 거래{sorted ? ` ${sorted.length}건` : ""}
        </h3>
        {failed ? (
          <div className="space-y-2 py-4 text-center text-sm">
            <p>거래를 불러오지 못했습니다.</p>
            <Button variant="outline" size="sm" onClick={reload}>
              다시 시도
            </Button>
          </div>
        ) : sorted === null ? (
          <div className="space-y-1.5" aria-label="불러오는 중">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : sorted.length === 0 ? (
          <p className="rounded-md border border-dashed py-4 text-center text-sm text-muted-foreground">
            이날 기록된 거래가 없습니다.
          </p>
        ) : (
          <div className="overflow-hidden rounded-md border">
            <table aria-label="이날 거래" className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-14" />
                <col />
                <col />
                <col className="w-24" />
                <col className="w-28" />
              </colgroup>
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-2 py-1.5 font-medium">구분</th>
                  <th scope="col" className="px-2 py-1.5 font-medium">내용</th>
                  <th scope="col" className="px-2 py-1.5 font-medium">카테고리·계좌</th>
                  <th scope="col" className="px-2 py-1.5 font-medium">결제한 사람</th>
                  <th scope="col" className="px-2 py-1.5 text-right font-medium">금액</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((tx) => (
                  <DayRow key={tx.id} tx={tx} onOpen={() => setOpen(tx)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="space-y-2 border-t p-3">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground">여러 건 입력</h3>
        <BulkEntryGrid columns={PANEL_COLUMNS} defaultDate={date} compact onSaved={reload} />
      </div>

      <TransactionSheet tx={open} onClose={() => setOpen(null)} onChanged={reload} />
    </section>
  );
}
