"use client";

import { useMemo, useState } from "react";
import Form from "next/form";
import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { categoryOptions } from "../domain/category-tree";
import { TRANSACTION_TYPE_LABEL, type Transaction } from "../domain/finance.types";
import { formatDay } from "../domain/period";
import type { TransactionFilter } from "../schemas/finance.schema";
import { useFinance } from "./finance-provider";
import { TransactionSheet } from "./panels";
import { TransactionRow } from "./transaction-detail";
import { Field, selectClass } from "./transaction-form";

/** Search & filter (spec §23). A GET form: the filter lives in the URL and the server runs the query. */
export function TransactionFilters({ filter }: { filter: TransactionFilter }) {
  const f = useFinance();
  // Archived categories and accounts stay filterable: old transactions use them.
  const categories = useMemo(
    () => [
      ...categoryOptions(f.categories.map((c) => ({ ...c, is_active: true })), "EXPENSE").map((o) => ({ ...o, group: "지출" })),
      ...categoryOptions(f.categories.map((c) => ({ ...c, is_active: true })), "INCOME").map((o) => ({ ...o, group: "수입" })),
    ],
    [f.categories],
  );
  return (
    <Form action="/finance/transactions" aria-label="거래 필터" className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input id="filter-q" name="q" defaultValue={filter.q ?? ""} placeholder="가맹점·메모 검색" aria-label="검색어" className="pl-8" maxLength={100} />
        </div>
        <Button type="submit">검색</Button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="시작일" htmlFor="filter-from">
          <DatePicker id="filter-from" name="from" defaultValue={filter.from} clearable weekStartsOn={0} />
        </Field>
        <Field label="종료일" htmlFor="filter-to">
          <DatePicker id="filter-to" name="to" defaultValue={filter.to} clearable weekStartsOn={0} />
        </Field>
        <Field label="종류" htmlFor="filter-type">
          <select id="filter-type" name="type" defaultValue={filter.type ?? ""} className={selectClass}>
            <option value="">전체</option>
            {(["EXPENSE", "INCOME", "TRANSFER", "REFUND"] as const).map((t) => (
              <option key={t} value={t}>
                {TRANSACTION_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="카테고리" htmlFor="filter-category">
          <select id="filter-category" name="category" defaultValue={filter.category ?? ""} className={selectClass}>
            <option value="">전체</option>
            {(["지출", "수입"] as const).map((g) => (
              <optgroup key={g} label={g}>
                {categories
                  .filter((c) => c.group === g)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label="계좌" htmlFor="filter-account">
          <select id="filter-account" name="account" defaultValue={filter.account ?? ""} className={selectClass}>
            <option value="">전체 계좌</option>
            {f.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.is_active ? "" : " (보관됨)"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="결제한 사람" htmlFor="filter-payer">
          <select id="filter-payer" name="paidBy" defaultValue={filter.paidBy ?? ""} className={selectClass}>
            <option value="">누구든</option>
            {f.members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="최소 금액" htmlFor="filter-min">
          <Input id="filter-min" name="min" inputMode="decimal" defaultValue={filter.min ?? ""} placeholder="0" />
        </Field>
        <Field label="최대 금액" htmlFor="filter-max">
          <Input id="filter-max" name="max" inputMode="decimal" defaultValue={filter.max ?? ""} placeholder="제한 없음" />
        </Field>
      </div>
      <div className="flex justify-end gap-3 text-sm">
        <Link href="/finance/transactions?from=&to=" className="text-muted-foreground underline-offset-4 hover:underline">
          전체 기간
        </Link>
        <Link href="/finance/transactions" className="text-muted-foreground underline-offset-4 hover:underline">
          초기화
        </Link>
      </div>
    </Form>
  );
}

export function TransactionList({ rows, truncated }: { rows: Transaction[]; truncated: boolean }) {
  const [open, setOpen] = useState<Transaction | null>(null);
  const byDate = useMemo(() => {
    const groups = new Map<string, Transaction[]>();
    for (const tx of rows) groups.set(tx.transaction_date, [...(groups.get(tx.transaction_date) ?? []), tx]);
    return [...groups.entries()];
  }, [rows]);

  if (rows.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">조건에 맞는 거래가 없습니다.</p>;
  }
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {rows.length}건{truncated && " (최근 300건만 표시합니다. 기간을 좁혀 보세요.)"}
      </p>
      {byDate.map(([date, txs]) => (
        <section key={date} aria-label={formatDay(date)}>
          <h3 className="pb-1 text-xs font-semibold text-muted-foreground">{formatDay(date)}</h3>
          <ul className="-mx-4 divide-y divide-border border-y border-border sm:mx-0 sm:rounded-lg sm:border">
            {txs.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} onOpen={() => setOpen(tx)} />
            ))}
          </ul>
        </section>
      ))}
      <TransactionSheet tx={open} onClose={() => setOpen(null)} />
    </div>
  );
}
