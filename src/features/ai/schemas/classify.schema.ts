import { z } from "zod";

// Loose on purpose: the validator drops what doesn't fit the user's lists instead of failing the whole batch.
export const ClassifyOutputSchema = z.object({
  items: z.array(
    z.object({
      taskId: z.string(),
      taskType: z.string().nullable().optional(),
      domainId: z.string().nullable().optional(),
      complexity: z.number().nullable().optional(),
      skills: z.array(z.string()).default([]),
      confidence: z.number().min(0).max(1),
    }),
  ).max(20),
});
export type ClassifyOutput = z.infer<typeof ClassifyOutputSchema>;
