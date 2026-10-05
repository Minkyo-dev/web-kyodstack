import { runJobRoute } from "@/lib/job-route";
import { reconcileAll } from "@/features/vocab/services/sync.service";

// ADR 0046: nightly full pull + deletion check for every connected Notion word table.
export async function GET(request: Request) {
  return runJobRoute(request, "vocab_sync", (admin) => reconcileAll(admin));
}

export const POST = GET;
