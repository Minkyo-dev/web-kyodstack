"use client";

import { useState } from "react";
import { ChevronRight, Pencil, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActionRunner } from "@/hooks/use-action-runner";
import { cn } from "@/lib/utils";
import { deleteTransactionAction } from "../actions/finance.actions";
import { TRANSACTION_TYPE_LABEL, type Transaction } from "../domain/finance.types";
import { formatDay, formatTime } from "../domain/period";
import { TransactionAmount } from "./amount";
import { useFinance } from "./finance-provider";
import { TransactionForm } from "./transaction-form";

/** What a row says about itself: merchant (or category), category path, account(s). */
export function useTransactionText(tx: Transaction) {
  const f = useFinance();
  const category = f.categoryLabel(tx.category_id);
  const account = f.accountName(tx.account_id) ?? "알 수 없는 계좌";
  if (tx.type === "TRANSFER") {
    const to = f.accountName(tx.transfer_account_id) ?? "알 수 없는 계좌";
    return { title: tx.merchant_name || "이체", subtitle: `${account} → ${to}`, category: null, account };
  }
  return {
    title: tx.merchant_name || category?.split(" > ").at(-1) || TRANSACTION_TYPE_LABEL[tx.type as keyof typeof TRANSACTION_TYPE_LABEL],
    subtitle: [category, account].filter(Boolean).join(" · "),
    category,
    account,
  };
}

export function TransactionRow({ tx, onOpen, showDate }: { tx: Transaction; onOpen: () => void; showDate?: boolean }) {
  const text = useTransactionText(tx);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{text.title}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {showDate && `${tx.transaction_date} · `}
            {text.subtitle}
          </span>
        </span>
        <TransactionAmount tx={tx} className="shrink-0 text-sm font-medium" />
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
    </li>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] gap-2 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/**
 * Transaction detail with in-place edit and delete (spec §20). Editing swaps the panel content, never opens a second
 * modal (spec §19).
 */
export function TransactionDetail({
  tx,
  onChanged,
  onDeleted,
}: {
  tx: Transaction;
  onChanged?: (tx: Transaction) => void;
  onDeleted?: () => void;
}) {
  const f = useFinance();
  const text = useTransactionText(tx);
  const { run, pending } = useActionRunner();
  const [mode, setMode] = useState<"view" | "edit" | "refund" | "confirm-delete">("view");

  // ADR 0035: a refund of this expense starts from its category, account, merchant and amount; once saved, the panel
  // shows the new refund.
  if (mode === "refund") {
    return (
      <TransactionForm
        refundOf={tx}
        idPrefix={`refund-${tx.id.slice(0, 8)}`}
        onCancel={() => setMode("view")}
        onSaved={(next) => onChanged?.(next)}
      />
    );
  }

  if (mode === "edit") {
    return (
      <TransactionForm
        transaction={tx}
        idPrefix={`edit-${tx.id.slice(0, 8)}`}
        onCancel={() => setMode("view")}
        onSaved={(next) => {
          setMode("view");
          onChanged?.(next);
        }}
      />
    );
  }

  const time = formatTime(tx.transaction_time);
  const payer = f.memberName(tx.paid_by_user_id);
  const creator = f.memberName(tx.created_by_user_id);
  const editor = f.memberName(tx.updated_by_user_id);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">{TRANSACTION_TYPE_LABEL[tx.type as keyof typeof TRANSACTION_TYPE_LABEL]}</p>
        <h3 className="text-lg font-semibold break-words">{text.title}</h3>
        <TransactionAmount tx={tx} className="block text-2xl font-semibold" />
        {text.category && <p className="text-sm text-muted-foreground">{text.category}</p>}
      </div>
      <dl className="divide-y divide-border border-y border-border">
        {tx.type === "TRANSFER" ? (
          <Row label="계좌">{text.subtitle}</Row>
        ) : (
          <Row label="계좌">{text.account}</Row>
        )}
        <Row label={tx.type === "INCOME" ? "받은 사람" : tx.type === "REFUND" ? "환불받은 사람" : "결제한 사람"}>{payer ?? "지정 안 함"}</Row>
        <Row label="날짜">{formatDay(tx.transaction_date)}</Row>
        {time && <Row label="시간">{time}</Row>}
        {tx.note && <Row label="메모">{tx.note}</Row>}
        <Row label="기록">
          <span className="text-muted-foreground">
            {creator ?? "알 수 없음"} 입력{editor ? ` · ${editor} 수정` : ""}
          </span>
        </Row>
      </dl>
      {mode === "confirm-delete" ? (
        <div className="flex flex-wrap items-center justify-end gap-2 rounded-lg border border-destructive/40 p-3">
          <p className="mr-auto text-sm">이 거래를 삭제할까요? 되돌릴 수 없습니다.</p>
          <Button variant="ghost" size="sm" onClick={() => setMode("view")} disabled={pending}>
            취소
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={pending}
            onClick={() =>
              run(() => deleteTransactionAction({ transactionId: tx.id }), {
                success: "거래를 삭제했습니다.",
                onSuccess: () => onDeleted?.(),
              })
            }
          >
            삭제
          </Button>
        </div>
      ) : (
        <div className={cn("flex justify-end gap-2")}>
          {tx.type === "EXPENSE" && (
            <Button variant="outline" size="sm" className="mr-auto" onClick={() => setMode("refund")}>
              <Undo2 aria-hidden />
              환불 기록
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setMode("edit")}>
            <Pencil aria-hidden />
            수정
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setMode("confirm-delete")}>
            <Trash2 aria-hidden />
            삭제
          </Button>
        </div>
      )}
    </div>
  );
}
