import { z } from "zod";
import { isLocalDateString } from "../utils/timezone";

const score = z.coerce.number().int().min(1).max(5).nullable();

export const upsertReflectionSchema = z.object({
  reflectionDate: z.string().refine(isLocalDateString, "날짜 형식이 올바르지 않습니다."),
  moodScore: score,
  focusScore: score,
  energyScore: score,
  note: z.string().trim().max(5000).nullable(),
});
export type UpsertReflectionInput = z.infer<typeof upsertReflectionSchema>;
