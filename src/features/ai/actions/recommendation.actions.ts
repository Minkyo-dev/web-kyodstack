"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import { acceptRecommendation, rejectRecommendation } from "../services/task-recommendation.service";
import { acceptRecommendationSchema, rejectRecommendationSchema } from "../schemas/recommendation.schema";

export async function acceptAiRecommendationAction(input: unknown) {
  return runAction("ai_recommendation.accept", acceptRecommendationSchema, input, async (data, ctx) => {
    const task = await acceptRecommendation(ctx, data);
    revalidatePath("/scheduler", "layout");
    return { taskId: task.id };
  });
}

export async function rejectAiRecommendationAction(input: unknown) {
  return runAction("ai_recommendation.reject", rejectRecommendationSchema, input, async (data, ctx) => {
    await rejectRecommendation(ctx, data.recommendationId);
    revalidatePath("/scheduler", "layout");
  });
}
