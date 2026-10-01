import type { Metadata } from "next";
import { requireUserOrRedirect } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TransactionFilters, TransactionList } from "@/features/finance/components/transaction-list";
import { monthRange } from "@/features/finance/domain/period";
import { listTransactions } from "@/features/finance/queries/finance.queries";
import { getFinanceContext, getFinanceLookups } from "@/features/finance/queries/household.queries";
import { transactionFilterSchema } from "@/features/finance/schemas/finance.schema";

export const metadata: Metadata = { title: "거래", robots: { index: false } };

/** Transactions (spec §23): search and filters in the URL. Without a date range in the URL it shows this month. */
export default async function FinanceTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUserOrRedirect();
  const ctx = (await getFinanceContext(user.id))!;
  const lookups = (await getFinanceLookups(user.id))!;
  const sp = await searchParams;
  const raw = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v || undefined]));
  const filter = transactionFilterSchema.parse(raw);
  if (!("from" in sp) && !("to" in sp)) {
    const [y, m] = ctx.today.split("-").map(Number);
    Object.assign(filter, monthRange(y, m));
  }

  const { rows, truncated } = await listTransactions(await createClient(), ctx.household.id, filter, lookups.categories);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <TransactionFilters key={JSON.stringify(filter)} filter={filter} />
      <TransactionList rows={rows} truncated={truncated} />
    </div>
  );
}
