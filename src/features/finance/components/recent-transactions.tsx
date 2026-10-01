"use client";

import { useState } from "react";
import Link from "next/link";
import type { Transaction } from "../domain/finance.types";
import { TransactionSheet } from "./panels";
import { TransactionRow } from "./transaction-detail";

export function RecentTransactions({ rows }: { rows: Transaction[] }) {
  const [open, setOpen] = useState<Transaction | null>(null);
  return (
    <section aria-labelledby="recent-transactions" className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 id="recent-transactions" className="text-sm font-medium">
          최근 거래
        </h2>
        <Link href="/finance/transactions" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
          전체 보기
        </Link>
      </div>
      <ul className="divide-y divide-border border-y border-border [&_button]:px-1">
        {rows.map((tx) => (
          <TransactionRow key={tx.id} tx={tx} showDate onOpen={() => setOpen(tx)} />
        ))}
      </ul>
      <TransactionSheet tx={open} onClose={() => setOpen(null)} />
    </section>
  );
}
