"use client";

import { useState } from "react";
import { ChevronLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { DayTotals, Transaction } from "../domain/finance.types";
import { formatDay, formatShortDay } from "../domain/period";
import { Amount } from "./amount";
import { useFinance } from "./finance-provider";
import { ResponsiveSheet } from "./panels";
import { TransactionDetail, TransactionRow } from "./transaction-detail";
import { TransactionForm } from "./transaction-form";
import { useDayTransactions } from "./use-day-transactions";

type View = { kind: "list" } | { kind: "detail"; tx: Transaction } | { kind: "add" };

const GROUPS = [
  { key: "INCOME", label: "수입", types: ["INCOME"] },
  { key: "EXPENSE", label: "지출", types: ["EXPENSE", "REFUND"] },
  { key: "TRANSFER", label: "이체", types: ["TRANSFER", "ADJUSTMENT"] },
] as const;

/**
 * Day Drawer (spec §18–19): the day's totals (from the calendar aggregate, the same rule as the dashboard), its
 * transactions grouped by kind, then detail → edit/delete and add, all inside the one drawer with a back button.
 */
export function DayDrawer({
  date,
  totals,
  initialTransactions,
  onClose,
}: {
  date: string | null;
  totals: DayTotals | null;
  initialTransactions: Transaction[] | null;
  onClose: () => void;
}) {
  const f = useFinance();
  const [view, setView] = useState<View>({ kind: "list" });
  const [shownDate, setShownDate] = useState(date);
  if (date && date !== shownDate) {
    setShownDate(date);
    setView({ kind: "list" });
  }
  const { rows, failed, reload } = useDayTransactions(
    shownDate,
    initialTransactions && date ? { date, rows: initialTransactions } : null,
  );

  const day = shownDate;
  const back = (
    <button
      type="button"
      onClick={() => setView({ kind: "list" })}
      className="-ml-1 mb-1 flex w-fit items-center gap-1 rounded-md px-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft className="size-4" aria-hidden />
      {day ? formatShortDay(day) : ""}
    </button>
  );

  return (
    <ResponsiveSheet
      open={!!date}
      onOpenChange={(o) => !o && onClose()}
      title={view.kind === "add" ? "거래 추가" : view.kind === "detail" ? "거래 상세" : day ? formatDay(day) : ""}
      header={view.kind !== "list" ? back : undefined}
    >
      {view.kind === "add" && day && (
        <div className="p-4">
          <TransactionForm
            idPrefix="day-add"
            defaultDate={day}
            onCancel={() => setView({ kind: "list" })}
            onSaved={() => {
              setView({ kind: "list" });
              reload();
            }}
          />
        </div>
      )}

      {view.kind === "detail" && (
        <div className="p-4">
          <TransactionDetail
            key={view.tx.id}
            tx={view.tx}
            onChanged={(tx) => {
              setView({ kind: "detail", tx });
              reload();
            }}
            onDeleted={() => {
              setView({ kind: "list" });
              reload();
            }}
          />
        </div>
      )}

      {view.kind === "list" && (
        <div className="pb-4">
          <dl className="grid grid-cols-3 border-b border-border text-center" aria-label="이날 합계">
            {[
              { label: "수입", value: totals?.income ?? 0 },
              { label: "지출", value: -(totals?.expense ?? 0) },
              { label: "순수입", value: totals?.net ?? 0 },
            ].map((m) => (
              <div key={m.label} className="space-y-0.5 px-2 py-3">
                <dt className="text-xs text-muted-foreground">{m.label}</dt>
                <dd className="text-sm font-semibold">
                  <Amount value={m.value} currency={f.currency} />
                </dd>
              </div>
            ))}
          </dl>

          {failed ? (
            <div className="space-y-2 px-4 py-8 text-center text-sm">
              <p>거래를 불러오지 못했습니다.</p>
              <Button variant="outline" size="sm" onClick={reload}>
                다시 시도
              </Button>
            </div>
          ) : rows === null ? (
            <div className="space-y-2 p-4" aria-label="불러오는 중">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">이날 기록된 거래가 없습니다.</p>
          ) : (
            GROUPS.map((g) => {
              const items = rows.filter((r) => (g.types as readonly string[]).includes(r.type));
              if (items.length === 0) return null;
              return (
                <section key={g.key} aria-label={g.label} className="pt-3">
                  <h3 className="px-4 pb-1 text-xs font-semibold tracking-widest text-muted-foreground">{g.label}</h3>
                  <ul className="divide-y divide-border">
                    {items.map((tx) => (
                      <TransactionRow key={tx.id} tx={tx} onOpen={() => setView({ kind: "detail", tx })} />
                    ))}
                  </ul>
                </section>
              );
            })
          )}

          <div className="px-4 pt-4">
            <Button variant="outline" className="w-full" onClick={() => setView({ kind: "add" })}>
              <Plus aria-hidden />
              이날 거래 추가
            </Button>
          </div>
        </div>
      )}
    </ResponsiveSheet>
  );
}
