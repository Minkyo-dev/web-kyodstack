import { z } from "zod";

/** Coach line of the daily brief (ADR 0039). */
export const BriefLineOutputSchema = z.object({ line: z.string().trim().min(1).max(90) });
export type BriefLineOutput = z.infer<typeof BriefLineOutputSchema>;
