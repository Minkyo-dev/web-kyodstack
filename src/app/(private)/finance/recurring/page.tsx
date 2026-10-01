import type { Metadata } from "next";
import { requireUserOrRedirect } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SubscriptionSettings } from "@/features/finance/components/subscription-settings";
import { listSubscriptions } from "@/features/finance/queries/finance.queries";
import { getFinanceContext } from "@/features/finance/queries/household.queries";

export const metadata: Metadata = { title: "정기 결제", robots: { index: false } };

/** Recurring payments (ADR 0029; spec §4 "Recurring"). */
export default async function FinanceRecurringPage() {
  const user = await requireUserOrRedirect();
  const ctx = (await getFinanceContext(user.id))!;
  const subscriptions = await listSubscriptions(await createClient(), ctx.household.id);
  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <SubscriptionSettings subscriptions={subscriptions} />
    </div>
  );
}
