import { runJobRoute } from "@/lib/job-route";
import { payAllHouseholds } from "@/features/finance/services/account.service";
import { chargeAllHouseholds } from "@/features/finance/services/subscription.service";

// ADR 0029 / 0034: records due subscription charges, then due card payments, even when nobody opens the finance pages.
export async function GET(request: Request) {
  return runJobRoute(request, "finance_subscriptions", async (admin) => {
    const subscriptions = await chargeAllHouseholds(admin);
    const cards = await payAllHouseholds(admin);
    return { ...subscriptions, cards };
  });
}

export const POST = GET;
