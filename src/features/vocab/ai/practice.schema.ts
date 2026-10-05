import { z } from "zod";

/** Generated practice sentences (prompt vocab-practice-gen-v1); refs are w1…w10 from the prompt. */
export const PracticeGenerateSchema = z.object({
  items: z
    .array(
      z.object({
        target_refs: z.array(z.string().regex(/^w\d{1,2}$/)).min(1).max(2),
        prompt_ko: z.string().trim().min(5).max(200),
        hint_ko: z.string().trim().max(100),
      }),
    )
    .min(1)
    .max(10),
});

export const CORRECTION_CATEGORIES = ["grammar", "word_choice", "article", "tense", "preposition", "word_order", "spelling", "other"] as const;
export const REGISTERS = ["casual", "neutral", "formal"] as const;

/** Feedback on one translation (prompt vocab-practice-feedback-v1). The verdict is a label, never a stat. */
export const PracticeFeedbackSchema = z.object({
  verdict: z.enum(["correct", "minor_issues", "incorrect"]),
  target_usage: z.object({ used: z.boolean(), correct: z.boolean(), note_ko: z.string().trim().max(300) }),
  corrections: z
    .array(
      z.object({
        original: z.string().trim().max(200),
        corrected: z.string().trim().max(200),
        category: z.enum(CORRECTION_CATEGORIES),
        explanation_ko: z.string().trim().min(1).max(300),
      }),
    )
    .max(8),
  corrected_sentence: z.string().trim().min(1).max(600),
  natural_sentence: z.string().trim().min(1).max(600),
  alternatives: z
    .array(z.object({ sentence: z.string().trim().min(1).max(600), register: z.enum(REGISTERS), nuance_ko: z.string().trim().min(1).max(300) }))
    .min(1)
    .max(3),
});
export type PracticeFeedback = z.infer<typeof PracticeFeedbackSchema>;
