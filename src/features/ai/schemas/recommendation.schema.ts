import { z } from "zod";

/** LLM output contract for task recommendations (spec §31, §33). */
export const RecommendationSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable(),
  estimatedMinutes: z.number().int().positive().max(480),
  priority: z.number().int().min(1).max(5),
  rationale: z.string().max(1000),
  projectId: z.string(),
  milestoneId: z.string().nullable(),
});
export type RecommendationOutput = z.infer<typeof RecommendationSchema>;

export const RecommendationListSchema = z.object({
  recommendations: z.array(RecommendationSchema).max(5),
});

export const acceptRecommendationSchema = z.object({
  recommendationId: z.uuid(),
  title: z.string().trim().min(1).max(200).optional(),
  estimatedMinutes: z.coerce.number().int().min(5).max(720).optional(),
});
export const rejectRecommendationSchema = z.object({ recommendationId: z.uuid() });
