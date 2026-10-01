"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Pause, Pencil, Play, Plus, Repeat, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useActionRunner } from "@/hooks/use-action-runner";
import {
  createSubscriptionAction,
  deleteSubscriptionAction,
  setSubscriptionActiveAction,
  updateSubscriptionAction,
} from "../actions/finance.actions";
import { categoryOptions } from "../domain/category-tree";
import type { Subscription } from "../domain/finance.types";
import { formatMoney, sumAmounts } from "../domain/money";
import {
  BILLING_CYCLES,
  BILLING_CYCLE_LABEL,
  describeSchedule,
  monthlyAmount,
  nextDueDate,
  type BillingCycle,
} from "../domain/subscription";
import { Amount } from "./amount";
import { useFinance } from "./finance-provider";
import { Field, selectClass } from "./transaction-form";

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

function SubscriptionForm({ subscription, onDone }: { subscription?: Subscription; onDone: () => void }) {
  const f = useFinance();
  const { run, pending } = useActionRunner();
  const [cycle, setCycle] = useState<BillingCycle>((subscription?.billing_cycle as BillingCycle) ?? "MONTHLY");
  const [startDate, setStartDate] = useState(subscription?.start_date ?? f.today);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const accounts = f.accounts.filter((a) => a.is_active || a.id === subscription?.account_id);
  const categories = useMemo(() => categoryOptions(f.categories, "EXPENSE", subscription?.category_id), [f.categories, subscription]);
  const p = subscription ? `sub-${subscription.id.slice(0, 8)}` : "sub-new";
  const err = (k: string) => errors[k]?.[0];
  const todayDay = Number(f.today.slice(8, 10));

  return (
    <form
      aria-label={subscription ? `${subscription.name} 수정` : "새 정기 결제"}
      className="space-y-3 rounded-lg border border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const input = {
          name: String(fd.get("name") ?? ""),
          amount: String(fd.get("amount") ?? ""),
          billingCycle: cycle,
          billingDay: String(fd.get("billingDay") ?? ""),
          billingMonth: cycle === "YEARLY" ? String(fd.get("billingMonth") ?? "") : null,
          startDate,
          endDate: String(fd.get("endDate") ?? ""),
          accountId: String(fd.get("accountId") ?? ""),
          categoryId: String(fd.get("categoryId") ?? ""),
          paidByUserId: String(fd.get("paidByUserId") ?? "") || null,
          note: String(fd.get("note") ?? ""),
        };
        run(
          () =>
            subscription ? updateSubscriptionAction({ ...input, subscriptionId: subscription.id }) : createSubscriptionAction(input),
          {
            onSuccess: (r) => {
              const saved = subscription ? "정기 결제를 수정했습니다." : "정기 결제를 추가했습니다.";
              toast.success(r.charged ? `${saved} 결제 ${r.charged}건을 거래로 기록했습니다.` : saved);
              onDone();
            },
          },
        ).then((r) => setErrors(r.ok ? {} : (r.fieldErrors ?? {})));
      }}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="이름" htmlFor={`${p}-name`} error={err("name")}>
          <Input id={`${p}-name`} name="name" defaultValue={subscription?.name} required maxLength={100} placeholder="예: Netflix" />
        </Field>
        <Field label="금액" htmlFor={`${p}-amount`} error={err("amount")}>
          <Input
            id={`${p}-amount`}
            name="amount"
            inputMode="decimal"
            defaultValue={subscription?.amount}
            required
            placeholder="0.00"
          />
        </Field>
        <div className="grid grid-cols-3 gap-2 sm:col-span-2">
          <Field label="주기" htmlFor={`${p}-cycle`}>
            <select id={`${p}-cycle`} value={cycle} onChange={(e) => setCycle(e.target.value as BillingCycle)} className={selectClass}>
              {BILLING_CYCLES.map((c) => (
                <option key={c} value={c}>
                  {BILLING_CYCLE_LABEL[c]}
                </option>
              ))}
            </select>
          </Field>
          {cycle === "YEARLY" ? (
            <Field label="결제 월" htmlFor={`${p}-month`} error={err("billingMonth")}>
              <select
                id={`${p}-month`}
                name="billingMonth"
                defaultValue={subscription?.billing_month ?? Number(startDate.slice(5, 7))}
                className={selectClass}
              >
                {MONTHS.map((m) => (
                  <option key={m} value={m}>
                    {m}월
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <div />
          )}
          <Field label="결제일" htmlFor={`${p}-day`} error={err("billingDay")}>
            <select id={`${p}-day`} name="billingDay" defaultValue={subscription?.billing_day ?? todayDay} className={selectClass}>
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  {d === 31 ? "말일" : `${d}일`}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="계좌" htmlFor={`${p}-account`} error={err("accountId")}>
          <select id={`${p}-account`} name="accountId" defaultValue={subscription?.account_id ?? ""} required className={selectClass}>
            <option value="">선택</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="카테고리" htmlFor={`${p}-category`} error={err("categoryId")}>
          <select id={`${p}-category`} name="categoryId" defaultValue={subscription?.category_id ?? ""} required className={selectClass}>
            <option value="">선택</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.depth ? `  └ ${c.label}` : c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="시작일" htmlFor={`${p}-start`} error={err("startDate")}>
          <DatePicker id={`${p}-start`} value={startDate} onChange={(v) => setStartDate(v ?? f.today)} weekStartsOn={0} required />
        </Field>
        <Field label="종료일 (선택)" htmlFor={`${p}-end`} error={err("endDate")}>
          <DatePicker id={`${p}-end`} name="endDate" defaultValue={subscription?.end_date ?? ""} weekStartsOn={0} clearable placeholder="없음" />
        </Field>
        <Field label="결제한 사람" htmlFor={`${p}-payer`}>
          <select id={`${p}-payer`} name="paidByUserId" defaultValue={subscription ? (subscription.paid_by_user_id ?? "") : f.meId} className={selectClass}>
            <option value="">지정 안 함</option>
            {f.members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="메모 (선택)" htmlFor={`${p}-note`}>
          <Input id={`${p}-note`} name="note" defaultValue={subscription?.note ?? ""} maxLength={2000} />
        </Field>
      </div>
      {!subscription && startDate < f.today && (
        <p className="text-xs text-muted-foreground">시작일이 과거이면 그날부터 오늘까지의 결제가 모두 거래로 기록됩니다.</p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone} disabled={pending}>
          취소
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          저장
        </Button>
      </div>
    </form>
  );
}

function DeleteSubscriptionButton({ subscription }: { subscription: Subscription }) {
  const { run, pending } = useActionRunner();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`${subscription.name} 삭제`}
        className="text-muted-foreground hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <Trash2 aria-hidden />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>‘{subscription.name}’ 정기 결제를 삭제할까요?</DialogTitle>
            <DialogDescription>
              앞으로 결제가 기록되지 않습니다. 이미 기록된 거래는 그대로 남습니다. 잠시 멈추려면 삭제 대신 일시정지를
              쓰세요.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              취소
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                run(() => deleteSubscriptionAction({ id: subscription.id }), {
                  success: "정기 결제를 삭제했습니다.",
                  onSuccess: () => setOpen(false),
                })
              }
            >
              <Trash2 aria-hidden />
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SubscriptionRow({ subscription }: { subscription: Subscription }) {
  const f = useFinance();
  const { run, pending } = useActionRunner();
  const [editing, setEditing] = useState(false);
  if (editing)
    return (
      <li className="py-2">
        <SubscriptionForm subscription={subscription} onDone={() => setEditing(false)} />
      </li>
    );
  const next = nextDueDate(subscription, f.today);
  const status = !subscription.is_active ? "일시정지" : next ? `다음 결제 ${next}` : "종료됨";
  const meta = [describeSchedule(subscription), f.accountName(subscription.account_id), f.categoryLabel(subscription.category_id)].filter(
    Boolean,
  );
  return (
    <li className="flex items-center gap-2 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
          {subscription.name}
          {!subscription.is_active && (
            <span className="rounded border border-border px-1 text-[10px] font-normal text-muted-foreground">일시정지</span>
          )}
        </p>
        <p className="truncate text-xs text-muted-foreground">{meta.join(" · ")}</p>
      </div>
      <div className="text-right">
        <Amount value={-subscription.amount} currency={f.currency} className="text-sm" />
        <p className="text-xs text-muted-foreground">{status}</p>
      </div>
      <Button variant="ghost" size="icon-sm" aria-label={`${subscription.name} 수정`} onClick={() => setEditing(true)}>
        <Pencil aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={pending}
        aria-label={`${subscription.name} ${subscription.is_active ? "일시정지" : "재개"}`}
        onClick={() =>
          run(() => setSubscriptionActiveAction({ id: subscription.id, active: !subscription.is_active }), {
            success: subscription.is_active ? "일시정지했습니다." : "재개했습니다. 멈춘 기간의 결제는 기록하지 않습니다.",
          })
        }
      >
        {subscription.is_active ? <Pause aria-hidden /> : <Play aria-hidden />}
      </Button>
      <DeleteSubscriptionButton subscription={subscription} />
    </li>
  );
}

/**
 * Recurring payments (ADR 0029): each due date is recorded as an ordinary expense, so the calendar, dashboard and
 * search need nothing special. Charges are written when a finance page loads and by the daily job.
 */
export function SubscriptionSettings({ subscriptions }: { subscriptions: Subscription[] }) {
  const f = useFinance();
  const [adding, setAdding] = useState(false);
  const active = subscriptions.filter((s) => s.is_active && nextDueDate(s, f.today));
  const inactive = subscriptions.filter((s) => !active.includes(s));
  const monthly = sumAmounts(active.map(monthlyAmount));

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between gap-2 border-b border-border pb-2">
        <p className="text-sm text-muted-foreground">
          활성 {active.length}건 · 월 환산 <span className="font-medium text-foreground tabular-nums">{formatMoney(monthly, f.currency)}</span>
        </p>
        {!adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            정기 결제 추가
          </Button>
        )}
      </div>
      {adding && <SubscriptionForm onDone={() => setAdding(false)} />}
      {subscriptions.length === 0 && !adding && (
        <p className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          <Repeat className="size-5" aria-hidden />
          구독료, 통신비, 보험료처럼 매달·매년 나가는 돈을 등록하면 결제일마다 지출로 자동 기록됩니다.
        </p>
      )}
      {active.length > 0 && (
        <ul aria-label="활성 정기 결제" className="divide-y divide-border border-b border-border">
          {active.map((s) => (
            <SubscriptionRow key={s.id} subscription={s} />
          ))}
        </ul>
      )}
      {inactive.length > 0 && (
        <section aria-label="멈춘 정기 결제">
          <h2 className="text-xs font-semibold tracking-widest text-muted-foreground">일시정지·종료</h2>
          <ul className="divide-y divide-border border-b border-border">
            {inactive.map((s) => (
              <SubscriptionRow key={s.id} subscription={s} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
