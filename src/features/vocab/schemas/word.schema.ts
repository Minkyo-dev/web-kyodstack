import { z } from "zod";
import { CEFR_LEVELS, POS_OPTIONS } from "../domain/notion-schema";
import { WORD_LIMITS } from "../domain/word-mapping";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v ? v : null));

const optionalChoice = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.enum(values), z.literal("")])
    .nullable()
    .transform((v) => (v ? v : null));

const topics = z
  .array(z.string().trim())
  .transform((names) => [...new Set(names.filter(Boolean))])
  .pipe(
    z
      .array(z.string().max(WORD_LIMITS.topic).refine((name) => !name.includes(","), "주제에는 쉼표를 쓸 수 없어요."))
      .max(WORD_LIMITS.topics, `주제는 ${WORD_LIMITS.topics}개까지예요.`),
  );

/** Every editable field; each optional so the same shape serves create (defaults below) and patches. */
const fieldShape = {
  term: z.string().trim().min(1, "단어를 입력해 주세요.").max(WORD_LIMITS.term),
  meaning: optionalText(WORD_LIMITS.meaning),
  pos: optionalChoice(POS_OPTIONS),
  ipa: optionalText(WORD_LIMITS.ipa),
  example: optionalText(WORD_LIMITS.example),
  synonyms: optionalText(WORD_LIMITS.synonyms),
  note: optionalText(WORD_LIMITS.note),
  topics,
  cefr: optionalChoice(CEFR_LEVELS),
};

const patchSchema = z.object({
  term: fieldShape.term.optional(),
  meaning: fieldShape.meaning.optional(),
  pos: fieldShape.pos.optional(),
  ipa: fieldShape.ipa.optional(),
  example: fieldShape.example.optional(),
  synonyms: fieldShape.synonyms.optional(),
  note: fieldShape.note.optional(),
  topics: fieldShape.topics.optional(),
  cefr: fieldShape.cefr.optional(),
});

export const wordInputSchema = patchSchema.extend({ term: fieldShape.term }).transform((v) => ({
  term: v.term,
  meaning: v.meaning ?? null,
  pos: v.pos ?? null,
  ipa: v.ipa ?? null,
  example: v.example ?? null,
  synonyms: v.synonyms ?? null,
  note: v.note ?? null,
  topics: v.topics ?? [],
  cefr: v.cefr ?? null,
}));

export const updateWordSchema = z.object({
  id: z.uuid(),
  patch: patchSchema.refine((p) => Object.values(p).some((v) => v !== undefined), "바꿀 내용이 없어요."),
});

export const wordIdSchema = z.object({ id: z.uuid() });

export const enrichSchema = z.object({ terms: z.array(z.string().trim().min(1).max(WORD_LIMITS.term)).min(1).max(20) });
