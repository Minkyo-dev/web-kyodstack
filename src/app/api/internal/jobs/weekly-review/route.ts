import { runJobRoute } from "@/lib/job-route";
import { runWeeklyReview } from "@/features/jobs/services/jobs";

// Vercel Cron issues GET; POST allows manual or other schedulers (e.g. Supabase Cron + pg_net).
export async function GET(request: Request) {
  return runJobRoute(request, "weekly_review", (admin) => runWeeklyReview(admin));
}

export const POST = GET;
