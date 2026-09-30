import { runJobRoute } from "@/lib/job-route";
import { runDurationProfileRefresh } from "@/features/jobs/services/jobs";

// Vercel Cron issues GET; POST allows manual or other schedulers (e.g. Supabase Cron + pg_net).
export async function GET(request: Request) {
  return runJobRoute(request, "duration_profile_refresh", (admin) => runDurationProfileRefresh(admin));
}

export const POST = GET;
