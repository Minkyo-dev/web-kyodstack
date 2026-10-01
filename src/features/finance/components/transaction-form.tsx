"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useActionRunner } from "@/hooks/use-action-runner";
import { cn } from "@/lib/utils";
import { createTransactionAction, updateTransactionAction } from "../actions/finance.actions";
import { categoryOptions } from "../domain/category-tree";
import { ENTRY_TYPES, TRANSACTION_TYPE_LABEL, type EntryType, type Transaction } from "../domain/finance.types";
import { useFinance } from "./finance-provider";

export const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30 aria-invalid:border-destructive";

export function Field({
  label,
  htmlFor,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
      {error && (
        <p id={`${htmlFor}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

const PAYER_LABEL: Record<EntryType, string> = { EXPENSE: "결제한 사람", INCOME: "받은 사람", TRANSFER: "보낸 사람" };
const MERCHANT_LABEL: Record<EntryType, string> = { EXPENSE: "가맹점", INCOME: "보낸 곳", TRANSFER: "내용" };

/**
 * Add / edit form (spec §21–22). Required: amount, account, date, and a category for income/expense (a transfer needs
 * a destination account instead). Everything else is optional.
 */
export function TransactionForm({
  transaction,
  defaultDate,
  onSaved,
  onCancel,
  idPrefix = "tx",
}: {
  transaction?: Transaction;
  defaultDate?: string;
  onSaved?: (tx: Transaction) => void;
  onCancel?: () => void;
  idPrefix?: string;
}) {
  const finance = useFinance();
  const { run, pending } = useActionRunner();
  const editing = !!transaction;

  const initialType: EntryType =
    transaction && (ENTRY_TYPES as readonly string[]).includes(transaction.type) ? (transaction.type as EntryType) : "EXPENSE";
  const [type, setType] = useState<EntryType>(initialType);
  const [amount, setAmount] = useState(transaction ? String(Number(transaction.amount)) : "");
  const [accountId, setAccountId] = useState(transaction?.account_id ?? finance.activeAccounts[0]?.id ?? "");
  const [transferAccountId, setTransferAccountId] = useState(transaction?.transfer_account_id ?? "");
  const [categoryId, setCategoryId] = useState(transaction?.category_id ?? "");
  const [date, setDate] = useState<string | null>(transaction?.transaction_date ?? defaultDate ?? finance.today);
  const [time, setTime] = useState(transaction?.transaction_time?.slice(0, 5) ?? "");
  const [merchant, setMerchant] = useState(transaction?.merchant_name ?? "");
  const [payerTouched, setPayerTouched] = useState(editing);
  const [paidBy, setPaidBy] = useState(transaction ? (transaction.paid_by_user_id ?? "") : finance.meId);
  const [note, setNote] = useState(transaction?.note ?? "");
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  // Archived accounts stay selectable only when the transaction already uses them.
  const accountChoices = useMemo(
    () =>
      finance.accounts.filter(
        (a) => a.is_active || a.id === transaction?.account_id || a.id === transaction?.transfer_account_id,
      ),
    [finance.accounts, transaction],
  );
  const categoryChoices = useMemo(
    () => (type === "TRANSFER" ? [] : categoryOptions(finance.categories, type, transaction?.category_id)),
    [finance.categories, type, transaction?.category_id],
  );

  if (finance.activeAccounts.length === 0 && !editing) {
    return (
      <div className="space-y-2 py-4 text-sm">
        <p>거래를 기록하려면 계좌가 하나 이상 필요합니다.</p>
        <Link href="/finance/settings/accounts" className="text-sm underline underline-offset-4">
          계좌 추가하러 가기
        </Link>
      </div>
    );
  }

  const changeType = (next: EntryType) => {
    setType(next);
    const current = finance.categories.find((c) => c.id === categoryId);
    if (current && current.type !== next) setCategoryId("");
    setErrors({});
  };

  const changeAccount = (id: string) => {
    setAccountId(id);
    // A personal card is usually paid by its owner; follow it until the payer is picked by hand.
    if (!payerTouched) {
      const account = finance.accounts.find((a) => a.id === id);
      setPaidBy(account?.owner_user_id ?? finance.meId);
    }
  };

  const err = (key: string) => errors[key]?.[0];
  const id = (name: string) => `${idPrefix}-${name}`;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      type,
      amount,
      accountId,
      transferAccountId: type === "TRANSFER" ? transferAccountId || null : null,
      categoryId: type === "TRANSFER" ? null : categoryId || null,
      date: date ?? "",
      time: time || null,
      merchantName: merchant,
      paidByUserId: paidBy || null,
      note,
    };
    run(
      () =>
        transaction
          ? updateTransactionAction({ ...payload, transactionId: transaction.id })
          : createTransactionAction(payload),
      {
        success: editing ? "거래를 수정했습니다." : "거래를 추가했습니다.",
        onSuccess: (tx) => {
          setErrors({});
          onSaved?.(tx);
        },
      },
    ).then((result) => {
      if (!result.ok) setErrors(result.fieldErrors ?? {});
    });
  };

  return (
    <form aria-label={editing ? "거래 수정" : "거래 추가"} className="space-y-3" onSubmit={submit} noValidate>
      <div role="radiogroup" aria-label="거래 종류" className="grid grid-cols-3 gap-1 rounded-lg border border-border p-0.5">
        {ENTRY_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={type === t}
            onClick={() => changeType(t)}
            className={cn(
              "h-7 rounded-md text-sm font-medium transition-colors",
              type === t ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {TRANSACTION_TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      <Field label="금액" htmlFor={id("amount")} error={err("amount")}>
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
            $
          </span>
          <Input
            id={id("amount")}
            inputMode="decimal"
            autoComplete="off"
            autoFocus={!editing}
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            aria-invalid={!!err("amount")}
            className="pl-6 text-base tabular-nums"
          />
        </div>
      </Field>

      {type === "TRANSFER" ? (
        <div className="grid grid-cols-2 gap-2">
          <Field label="보내는 계좌" htmlFor={id("account")} error={err("accountId")}>
            <select id={id("account")} value={accountId} onChange={(e) => changeAccount(e.target.value)} className={selectClass} required>
              <option value="">선택</option>
              {accountChoices.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="받는 계좌" htmlFor={id("transfer")} error={err("transferAccountId")}>
            <select
              id={id("transfer")}
              value={transferAccountId}
              onChange={(e) => setTransferAccountId(e.target.value)}
              className={selectClass}
              aria-invalid={!!err("transferAccountId")}
              required
            >
              <option value="">선택</option>
              {accountChoices
                .filter((a) => a.id !== accountId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </Field>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Field label="카테고리" htmlFor={id("category")} error={err("categoryId")}>
            <select
              id={id("category")}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={selectClass}
              aria-invalid={!!err("categoryId")}
              required
            >
              <option value="">선택</option>
              {categoryChoices.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="계좌" htmlFor={id("account")} error={err("accountId")}>
            <select id={id("account")} value={accountId} onChange={(e) => changeAccount(e.target.value)} className={selectClass} required>
              <option value="">선택</option>
              {accountChoices.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Field label="날짜" htmlFor={id("date")} error={err("date")}>
          <DatePicker id={id("date")} value={date} onChange={setDate} weekStartsOn={0} required />
        </Field>
        <Field label="시간 (선택)" htmlFor={id("time")} error={err("time")}>
          <Input id={id("time")} type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-28" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label={`${MERCHANT_LABEL[type]} (선택)`} htmlFor={id("merchant")} error={err("merchantName")}>
          <Input id={id("merchant")} value={merchant} onChange={(e) => setMerchant(e.target.value)} maxLength={150} autoComplete="off" />
        </Field>
        <Field label={PAYER_LABEL[type]} htmlFor={id("payer")} error={err("paidByUserId")}>
          <select
            id={id("payer")}
            value={paidBy}
            onChange={(e) => {
              setPayerTouched(true);
              setPaidBy(e.target.value);
            }}
            className={selectClass}
          >
            <option value="">지정 안 함</option>
            {finance.members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="메모 (선택)" htmlFor={id("note")} error={err("note")}>
        <Textarea id={id("note")} rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
      </Field>

      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            취소
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "저장 중…" : "저장"}
        </Button>
      </div>
    </form>
  );
}
