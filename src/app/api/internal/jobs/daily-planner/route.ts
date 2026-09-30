import { runJobRoute } from "@/lib/job-route";
import { runDailyPlanner } from "@/features/jobs/services/jobs";

// Vercel Cron issues GET; POST allows manual or other schedulers (e.g. Supabase Cron + pg_net).
export async function GET(request: Request) {
  return runJobRoute(request, "daily_planner", (admin) => runDailyPlanner(admin));
}

export const POST = GET;
