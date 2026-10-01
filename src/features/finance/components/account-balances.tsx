"use client";

import { cn } from "@/lib/utils";
import { isLiability, type AccountBalance } from "../domain/balances";
import { ACCOUNT_GROUPS } from "../domain/account-groups";
import type { Account } from "../domain/finance.types";
import { formatMoney, formatSigned } from "../domain/money";
import { useFinance } from "./finance-provider";
import { ReconcileButton } from "./reconcile-dialog";

const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;

/** "갚을 돈 $820" for cards and loans, a signed amount otherwise: the meaning is in words, not only color. */
export function BalanceText({ account, balance, className }: { account: Account; balance: number; className?: string }) {
  const f = useFinance();
  if (isLiability(account.account_type)) {
    return (
      <span className={cn("tabular-nums", className)}>
        {balance < 0 ? "갚을 돈 " : balance > 0 ? "남은 크레딧 " : ""}
        {formatMoney(balance, f.currency)}
      </span>
    );
  }
  return <span className={cn("tabular-nums", className)}>{formatSigned(balance, f.currency)}</span>;
}

export function ReconciledNote({ account }: { account: Account }) {
  return (
    <span className="text-xs text-muted-foreground">{account.reconciled_on ? `${shortDate(account.reconciled_on)} 맞춤` : "맞춘 적 없음"}</span>
  );
}

/** Dashboard "재정 현황" list (ADR 0032): accounts grouped as in settings, each with its balance and reconcile. */
export function AccountBalanceList({ balances }: { balances: AccountBalance[] }) {
  const f = useFinance();
  const byId = new Map(balances.map((b) => [b.accountId, b.balance]));
  // Archived accounts only while they still hold money.
  const shown = f.accounts.filter((a) => a.is_active || (byId.get(a.id) ?? 0) !== 0);

  return (
    <div className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
      {ACCOUNT_GROUPS.map((g) => {
        const items = shown.filter(g.match);
        if (items.length === 0) return null;
        return (
          <section key={g.label} aria-label={`${g.label} 잔액`}>
            <h3 className="text-xs font-semibold tracking-widest text-muted-foreground">{g.label}</h3>
            <ul className="divide-y divide-border border-b border-border">
              {items.map((a) => (
                <li key={a.id} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      {a.name}
                      {!a.is_active && <span className="ml-1.5 text-xs text-muted-foreground">(보관)</span>}
                    </p>
                    <ReconciledNote account={a} />
                  </div>
                  <BalanceText account={a} balance={byId.get(a.id) ?? 0} className="text-sm font-medium" />
                  <ReconcileButton account={a} compact />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
