import { runJobRoute } from "@/lib/job-route";
import { runNotifications } from "@/features/assistant/services/notify.service";

// Supabase Cron (pg_cron + pg_net) POSTs every 5 minutes (ADR 0043); GET allows a manual check.
export async function GET(request: Request) {
  return runJobRoute(request, "notifications", (admin) => runNotifications(admin));
}

export const POST = GET;
