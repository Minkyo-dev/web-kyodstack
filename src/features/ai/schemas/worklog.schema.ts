import { z } from "zod";

export const DELAY_REASONS = ["environment_issue", "scope_change", "underestimate", "interruption", "unclear_requirements", "none"] as const;
export const WorklogOutputSchema = z.object({
  delayReason: z.enum(DELAY_REASONS),
  scopeChanged: z.boolean(),
  unexpectedBlocker: z.boolean(),
  blockerType: z.enum(["technical", "external", "personal", "none"]),
  confidence: z.number().min(0).max(1),
});
export type WorklogOutput = z.infer<typeof WorklogOutputSchema>;
