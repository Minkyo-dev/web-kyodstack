import { runJobRoute } from "@/lib/job-route";
import { chargeAllHouseholds } from "@/features/finance/services/subscription.service";

// ADR 0029: records due subscription charges even when nobody opens the finance pages.
export async function GET(request: Request) {
  return runJobRoute(request, "finance_subscriptions", (admin) => chargeAllHouseholds(admin));
}

export const POST = GET;
