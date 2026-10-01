"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActionRunner } from "@/hooks/use-action-runner";
import {
  createAccountAction,
  reorderAccountsAction,
  setAccountActiveAction,
  updateAccountAction,
} from "../actions/finance.actions";
import type { AccountBalance } from "../domain/balances";
import { moveInOrder } from "../domain/category-tree";
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABEL,
  OWNERSHIP_LABEL,
  type Account,
  type AccountType,
  type OwnershipType,
} from "../domain/finance.types";
import { BalanceText, ReconciledNote } from "./account-balances";
import { ACCOUNT_GROUPS } from "../domain/account-groups";
import { useFinance } from "./finance-provider";
import { ReconcileButton } from "./reconcile-dialog";
import { Field, selectClass } from "./transaction-form";

const PAYMENT_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const dayLabel = (day: number) => (day >= 31 ? "말일" : `${day}일`);

/** ADR 0034: a card's payment day and the account it is paid from. */
function CardPaymentFields({ account, prefix, errors }: { account?: Account; prefix: string; errors: Record<string, string[]> }) {
  const f = useFinance();
  // Any other account the household still uses, except cards; the current one stays even if archived since.
  const sources = f.accounts.filter(
    (a) =>
      a.id !== account?.id &&
      a.account_type !== "CREDIT_CARD" &&
      (a.is_active || a.id === account?.payment_account_id),
  );
  return (
    <div className="grid grid-cols-2 gap-2 sm:col-span-2">
      <Field label="결제일" htmlFor={`${prefix}-pay-day`} error={errors.paymentDay?.[0]}>
        <select id={`${prefix}-pay-day`} name="paymentDay" defaultValue={account?.payment_day ?? ""} className={selectClass}>
          <option value="">설정 안 함</option>
          {PAYMENT_DAYS.map((d) => (
            <option key={d} value={d}>
              매월 {dayLabel(d)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="출금 계좌" htmlFor={`${prefix}-pay-from`} error={errors.paymentAccountId?.[0]}>
        <select
          id={`${prefix}-pay-from`}
          name="paymentAccountId"
          defaultValue={account?.payment_account_id ?? ""}
          className={selectClass}
        >
          <option value="">설정 안 함</option>
          {sources.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      <p className="col-span-2 text-xs text-muted-foreground">
        결제일마다 그날까지 쌓인 갚을 돈 전액을 출금 계좌에서 이 카드로 이체해 0으로 만듭니다. 오늘 이후 결제일부터
        적용됩니다.
      </p>
    </div>
  );
}

function AccountForm({ account, onDone }: { account?: Account; onDone: () => void }) {
  const f = useFinance();
  const { run, pending } = useActionRunner();
  const [ownership, setOwnership] = useState<OwnershipType>((account?.ownership_type as OwnershipType) ?? "PERSONAL");
  const [type, setType] = useState<AccountType>((account?.account_type as AccountType) ?? "CHECKING");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const p = account ? `acct-${account.id.slice(0, 8)}` : "acct-new";
  return (
    <form
      aria-label={account ? `${account.name} 수정` : "새 계좌"}
      className="space-y-3 rounded-lg border border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const paymentDay = String(fd.get("paymentDay") ?? "");
        const input = {
          name: String(fd.get("name") ?? ""),
          accountType: type,
          institutionName: String(fd.get("institutionName") ?? ""),
          ownershipType: ownership,
          ownerUserId: ownership === "JOINT" ? null : String(fd.get("ownerUserId") ?? "") || null,
          paymentDay: type === "CREDIT_CARD" && paymentDay ? Number(paymentDay) : null,
          paymentAccountId: type === "CREDIT_CARD" ? String(fd.get("paymentAccountId") ?? "") || null : null,
        };
        run(() => (account ? updateAccountAction({ ...input, accountId: account.id }) : createAccountAction(input)), {
          success: account ? "계좌를 수정했습니다." : "계좌를 추가했습니다.",
          onSuccess: onDone,
        }).then((r) => setErrors(r.ok ? {} : (r.fieldErrors ?? {})));
      }}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="이름" htmlFor={`${p}-name`} error={errors.name?.[0]}>
          <Input id={`${p}-name`} name="name" defaultValue={account?.name} required maxLength={100} placeholder="예: TD Checking" />
        </Field>
        <Field label="기관 (선택)" htmlFor={`${p}-inst`}>
          <Input id={`${p}-inst`} name="institutionName" defaultValue={account?.institution_name ?? ""} maxLength={100} placeholder="예: TD Bank" />
        </Field>
        <Field label="종류" htmlFor={`${p}-type`}>
          <select
            id={`${p}-type`}
            name="accountType"
            value={type}
            onChange={(e) => setType(e.target.value as AccountType)}
            className={selectClass}
          >
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACCOUNT_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="소유 형태" htmlFor={`${p}-ownership`}>
            <select
              id={`${p}-ownership`}
              value={ownership}
              onChange={(e) => setOwnership(e.target.value as OwnershipType)}
              className={selectClass}
            >
              <option value="PERSONAL">{OWNERSHIP_LABEL.PERSONAL}</option>
              <option value="JOINT">{OWNERSHIP_LABEL.JOINT}</option>
            </select>
          </Field>
          {ownership === "PERSONAL" && (
            <Field label="소유자" htmlFor={`${p}-owner`} error={errors.ownerUserId?.[0]}>
              <select id={`${p}-owner`} name="ownerUserId" defaultValue={account?.owner_user_id ?? f.meId} className={selectClass}>
                {f.members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        {type === "CREDIT_CARD" && <CardPaymentFields account={account} prefix={p} errors={errors} />}
      </div>
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

function AccountRow({ account, siblings, balance }: { account: Account; siblings: string[]; balance?: number }) {
  const f = useFinance();
  const { run, pending } = useActionRunner();
  const [editing, setEditing] = useState(false);
  if (editing) return <li className="py-2"><AccountForm account={account} onDone={() => setEditing(false)} /></li>;
  const owner = f.memberName(account.owner_user_id);
  const meta = [
    OWNERSHIP_LABEL[account.ownership_type as OwnershipType],
    owner,
    ACCOUNT_TYPE_LABEL[account.account_type as AccountType],
    account.currency_code,
    account.institution_name,
  ].filter(Boolean);
  const payFrom = f.accounts.find((a) => a.id === account.payment_account_id);
  const payment =
    account.payment_day === null
      ? null
      : `매월 ${dayLabel(account.payment_day)} 결제 · ${payFrom ? `${payFrom.name}에서 출금` : "출금 계좌 없음"}`;
  const move = (dir: -1 | 1) => {
    const ids = moveInOrder(siblings, account.id, dir);
    if (ids) run(() => reorderAccountsAction({ ids }));
  };
  const i = siblings.indexOf(account.id);
  return (
    <li className="flex items-center gap-2 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{account.name}</p>
        <p className="truncate text-xs text-muted-foreground">{meta.join(" · ")}</p>
        {payment && <p className="truncate text-xs text-muted-foreground">{payment}</p>}
      </div>
      {balance !== undefined && (
        <div className="text-right">
          <BalanceText account={account} balance={balance} className="block text-sm" />
          <ReconciledNote account={account} />
        </div>
      )}
      <ReconcileButton account={account} compact />
      {account.is_active && (
        <>
          <Button variant="ghost" size="icon-sm" aria-label={`${account.name} 위로`} disabled={pending || i <= 0} onClick={() => move(-1)}>
            <ArrowUp aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${account.name} 아래로`}
            disabled={pending || i < 0 || i >= siblings.length - 1}
            onClick={() => move(1)}
          >
            <ArrowDown aria-hidden />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label={`${account.name} 수정`} onClick={() => setEditing(true)}>
            <Pencil aria-hidden />
          </Button>
        </>
      )}
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        aria-label={`${account.name} ${account.is_active ? "보관" : "복원"}`}
        onClick={() =>
          run(() => setAccountActiveAction({ id: account.id, active: !account.is_active }), {
            success: account.is_active ? "계좌를 보관했습니다." : "계좌를 복원했습니다.",
          })
        }
      >
        {account.is_active ? <Archive aria-hidden /> : <ArchiveRestore aria-hidden />}
        {account.is_active ? "보관" : "복원"}
      </Button>
    </li>
  );
}

/** Accounts (spec §24): create, rename, type/owner/institution, reorder, archive. */
export function AccountSettings({ balances }: { balances?: AccountBalance[] }) {
  const f = useFinance();
  const [adding, setAdding] = useState(false);
  const active = f.accounts.filter((a) => a.is_active);
  const archived = f.accounts.filter((a) => !a.is_active);
  // Reordering works on the household's whole active list so groups keep a stable relative order.
  const order = active.map((a) => a.id);
  const balanceOf = (id: string) => balances?.find((b) => b.accountId === id)?.balance;

  return (
    <div className="space-y-5">
      {active.length === 0 && !adding && (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          아직 계좌가 없습니다. 거래를 기록하려면 계좌를 먼저 추가하세요.
        </p>
      )}
      {ACCOUNT_GROUPS.map((g) => {
        const items = active.filter(g.match);
        if (items.length === 0) return null;
        const siblings = order.filter((id) => items.some((a) => a.id === id));
        return (
          <section key={g.label} aria-label={g.label}>
            <h2 className="text-xs font-semibold tracking-widest text-muted-foreground">{g.label}</h2>
            <ul className="divide-y divide-border border-b border-border">
              {items.map((a) => (
                <AccountRow key={a.id} account={a} siblings={siblings} balance={balanceOf(a.id)} />
              ))}
            </ul>
          </section>
        );
      })}
      {adding ? (
        <AccountForm onDone={() => setAdding(false)} />
      ) : (
        <Button variant="outline" onClick={() => setAdding(true)}>
          <Plus aria-hidden />
          계좌 추가
        </Button>
      )}
      {archived.length > 0 && (
        <details className="border-t border-border pt-3">
          <summary className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <Archive className="size-3.5" aria-hidden />
            보관된 계좌 ({archived.length})
          </summary>
          <ul className="divide-y divide-border" aria-label="보관된 계좌">
            {archived.map((a) => (
              <AccountRow key={a.id} account={a} siblings={[]} balance={balanceOf(a.id)} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
