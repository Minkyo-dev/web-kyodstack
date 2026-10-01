"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useActionRunner } from "@/hooks/use-action-runner";
import { getAccountBalanceAction, reconcileAccountAction } from "../actions/finance.actions";
import { balanceFromInput, isLiability } from "../domain/balances";
import type { Account } from "../domain/finance.types";
import { formatMoney, formatSigned, fromCents, toCents } from "../domain/money";
import { useFinance } from "./finance-provider";
import { Field } from "./transaction-form";

function parseInput(text: string): number | null {
  const clean = text.trim().replace(/[,$\s]/g, "");
  return /^-?\d+(\.\d{1,2})?$/.test(clean) ? Number(clean) : null;
}

/**
 * Reconcile (ADR 0032): enter the real balance on a date; the difference from the computed balance is recorded as one
 * adjustment. Cards and loans take the amount owed as a positive number. Until the first reconcile the button reads
 * "시작 잔액 설정".
 */
export function ReconcileButton({ account, compact = false }: { account: Account; compact?: boolean }) {
  const f = useFinance();
  const { run, pending } = useActionRunner();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(f.today);
  const [text, setText] = useState("");
  const [computed, setComputed] = useState<number | null>(null);
  const liability = isLiability(account.account_type);
  const label = account.reconciled_on ? "잔액 맞추기" : "시작 잔액 설정";
  const p = `rec-${account.id.slice(0, 8)}`;

  useEffect(() => {
    if (!open) return;
    let live = true;
    getAccountBalanceAction({ accountId: account.id, date }).then((r) => {
      if (live) setComputed(r.ok ? r.data : null);
    });
    return () => {
      live = false;
    };
  }, [open, account.id, date]);

  const typed = parseInput(text);
  const actual = typed === null ? null : balanceFromInput(account.account_type, typed);
  const diff = actual === null || computed === null ? null : fromCents(toCents(actual) - toCents(computed));
  const shown = (balance: number) =>
    liability ? `${formatMoney(Math.abs(balance), f.currency)} ${balance <= 0 ? "갚을 돈" : "남은 크레딧"}` : formatSigned(balance, f.currency);

  return (
    <>
      <Button
        variant="ghost"
        size={compact ? "icon-sm" : "sm"}
        aria-label={`${account.name} ${label}`}
        title={label}
        onClick={() => {
          setDate(f.today);
          setText("");
          setComputed(null);
          setOpen(true);
        }}
      >
        <Scale aria-hidden />
        {!compact && label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {account.name} {label}
            </DialogTitle>
            <DialogDescription>
              은행·카드 앱에 보이는 실제 잔액을 입력하세요. 계산된 잔액과의 차이는 ‘조정’ 거래로 기록되며 지출 통계에는
              포함되지 않습니다. 빠진 거래가 있다면 먼저 기록하는 것이 좋습니다.
            </DialogDescription>
          </DialogHeader>
          <form
            id={`${p}-form`}
            aria-label={`${account.name} ${label}`}
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (actual === null) return;
              run(() => reconcileAccountAction({ accountId: account.id, date, actual }), {
                onSuccess: (r) => {
                  toast.success(
                    r.difference === 0 ? "이미 잔액이 맞습니다." : `조정 ${formatSigned(r.difference, f.currency)}을 기록했습니다.`,
                  );
                  setOpen(false);
                },
              });
            }}
          >
            <Field label="날짜" htmlFor={`${p}-date`}>
              <DatePicker id={`${p}-date`} value={date} onChange={(v) => setDate(v ?? f.today)} max={f.today} weekStartsOn={0} required />
            </Field>
            <Field label={liability ? "갚을 금액" : "실제 잔액"} htmlFor={`${p}-actual`}>
              <Input
                id={`${p}-actual`}
                inputMode="decimal"
                autoComplete="off"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="0.00"
                required
                aria-invalid={text !== "" && typed === null}
              />
            </Field>
          </form>
          <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border bg-border text-sm" aria-live="polite">
            <div className="bg-background px-3 py-2">
              <dt className="text-xs text-muted-foreground">계산된 잔액</dt>
              <dd className="tabular-nums">{computed === null ? "…" : shown(computed)}</dd>
            </div>
            <div className="bg-background px-3 py-2">
              <dt className="text-xs text-muted-foreground">실제 잔액</dt>
              <dd className="tabular-nums">{actual === null ? "—" : shown(actual)}</dd>
            </div>
            <div className="bg-background px-3 py-2">
              <dt className="text-xs text-muted-foreground">조정</dt>
              <dd className="tabular-nums">{diff === null ? "—" : diff === 0 ? "없음" : formatSigned(diff, f.currency)}</dd>
            </div>
          </dl>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              취소
            </Button>
            <Button type="submit" form={`${p}-form`} disabled={pending || actual === null}>
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
