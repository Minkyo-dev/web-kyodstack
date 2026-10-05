import { z } from "zod";
import { CEFR_LEVELS } from "../domain/notion-schema";
import { PRACTICE_SOURCES } from "../domain/practice";

export const createPracticeSchema = z
  .object({
    source: z.enum(PRACTICE_SOURCES),
    topic: z.string().trim().min(1).max(50).optional(),
    wordIds: z.array(z.uuid()).max(10).optional(),
    size: z.coerce.number().int().min(1).max(10),
    cefr: z.enum(CEFR_LEVELS),
  })
  .refine((v) => v.source !== "topic" || !!v.topic, { message: "주제를 골라 주세요.", path: ["topic"] })
  .refine((v) => v.source !== "manual" || (v.wordIds?.length ?? 0) > 0, { message: "단어를 하나 이상 골라 주세요.", path: ["wordIds"] });

export const submitAnswerSchema = z.object({ itemId: z.uuid(), answer: z.string().trim().min(1, "영어 문장을 입력해 주세요.").max(500) });
