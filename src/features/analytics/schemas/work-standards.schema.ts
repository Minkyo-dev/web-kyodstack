import { z } from "zod";

export const workStandardsSchema = z.object({
  plannedWorkDays: z
    .array(z.coerce.number().int().min(0).max(6))
    .transform((d) => [...new Set(d)].sort((a, b) => a - b))
    .refine((d) => d.length >= 1, "근무 요일을 하나 이상 골라 주세요."),
  minMeaningfulMinutes: z.coerce.number().int().min(5).max(480),
  commitLeadMinutes: z.coerce.number().int().min(0).max(1440),
});
export type WorkStandardsInput = z.infer<typeof workStandardsSchema>;
