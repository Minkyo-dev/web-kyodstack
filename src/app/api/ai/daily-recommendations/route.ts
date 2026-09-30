import { z } from "zod";
import { runRoute } from "@/lib/route";
import { generateDailyRecommendations } from "@/features/ai/services/task-recommendation.service";

/** POST {} → today's project/milestone task recommendations (pending until accepted). */
export async function POST(request: Request) {
  return runRoute("ai.daily_recommendations", request, z.object({}), async (_data, ctx) =>
    generateDailyRecommendations(ctx),
  );
}
