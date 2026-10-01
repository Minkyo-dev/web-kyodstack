import { z } from "zod";
import { STAT_TYPES } from "@/features/analytics/domain/stats.types";

const line = z.string().trim().max(80).nullable();

export const AnalysisOutputSchema = z.object({
  explanations: z
    .array(
      z.object({
        stat: z.enum(STAT_TYPES),
        headline: z.string().trim().min(1).max(60),
        detail: z.string().trim().max(200),
        evidence: z.array(z.string().trim().max(60)).max(4).default([]),
      }),
    )
    .max(4),
  assessment: z.object({ planningTendency: line, workStyle: line, currentRisk: line, strongPattern: line }),
  directionNote: z.string().trim().max(200).nullable().default(null),
});
