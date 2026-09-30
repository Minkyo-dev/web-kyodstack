import { z } from "zod";
import { isLocalDateString } from "@/features/scheduler/utils/timezone";

/** LLM output contract for the weekly review (spec §32.2). */
export const WeeklyReviewOutputSchema = z.object({
  summary: z.string().min(1).max(1500),
  positives: z.array(z.string().min(1).max(300)).max(5),
  issues: z.array(z.string().min(1).max(300)).max(5),
  recommendations: z
    .array(
      z.object({
        title: z.string().min(1).max(120),
        reason: z.string().min(1).max(400),
        action: z.string().min(1).max(400),
      }),
    )
    .max(5),
});
export type WeeklyReviewOutput = z.infer<typeof WeeklyReviewOutputSchema>;

export const weeklyReviewRequestSchema = z.object({
  weekStart: z.string().refine(isLocalDateString).optional(),
});
