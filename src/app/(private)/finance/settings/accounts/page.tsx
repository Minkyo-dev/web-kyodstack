import type { Metadata } from "next";
import { requireUserOrRedirect } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AccountSettings } from "@/features/finance/components/account-settings";
import { getAccountBalances } from "@/features/finance/queries/finance.queries";
import { getFinanceContext } from "@/features/finance/queries/household.queries";

export const metadata: Metadata = { title: "계좌 설정", robots: { index: false } };

export default async function FinanceAccountsPage() {
  const user = await requireUserOrRedirect();
  const ctx = (await getFinanceContext(user.id))!;
  // Balances are a convenience here: if they fail, settings still work without them.
  const balances = await getAccountBalances(await createClient(), ctx.household.id, ctx.today).catch(() => undefined);
  return <AccountSettings balances={balances} />;
}
