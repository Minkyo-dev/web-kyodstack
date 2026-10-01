import { cn } from "@/lib/utils";
import type { Transaction } from "../domain/finance.types";
import { formatMoney, formatSigned } from "../domain/money";

/**
 * Money text. The sign is always printed (spec §37); color only reinforces it. Transfers are unsigned with an arrow
 * because they are neither income nor expense.
 */
export function Amount({
  value,
  currency,
  signed = true,
  tone = true,
  className,
}: {
  value: number;
  currency?: string;
  signed?: boolean;
  tone?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "tabular-nums",
        tone && value > 0 && signed && "text-income",
        className,
      )}
    >
      {signed ? formatSigned(value, currency) : formatMoney(value, currency)}
    </span>
  );
}

export function TransactionAmount({
  tx,
  className,
}: {
  tx: Pick<Transaction, "type" | "amount" | "currency_code">;
  className?: string;
}) {
  const amount = Number(tx.amount);
  if (tx.type === "TRANSFER") {
    return (
      <span className={cn("tabular-nums text-muted-foreground", className)}>
        ⇄ {formatMoney(amount, tx.currency_code)}
      </span>
    );
  }
  const value = tx.type === "EXPENSE" ? -amount : amount;
  return <Amount value={value} currency={tx.currency_code} className={className} />;
}
