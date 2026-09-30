import { runRoute } from "@/lib/route";
import { generateWeeklyReview } from "@/features/ai/services/weekly-review.service";
import { weeklyReviewRequestSchema } from "@/features/ai/schemas/weekly-review.schema";

/** POST { weekStart?: "yyyy-MM-dd" } → generates (or regenerates) that week's review. */
export async function POST(request: Request) {
  return runRoute("ai.weekly_review", request, weeklyReviewRequestSchema, async (data, ctx) => {
    const review = await generateWeeklyReview(ctx, data.weekStart);
    return { weekStart: review.week_start };
  });
}
