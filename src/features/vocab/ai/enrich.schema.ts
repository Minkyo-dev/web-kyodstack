import { z } from "zod";
import { CEFR_LEVELS, POS_OPTIONS } from "../domain/notion-schema";

/** AI auto-fill reply (spec §9.2, prompt vocab-enrich-v1). Suggestions only; the user saves. */
export const VocabEnrichItemSchema = z.object({
  term: z.string().trim().min(1).max(200),
  meaning_ko: z.string().trim().min(1).max(300),
  pos: z.enum(POS_OPTIONS),
  ipa: z.string().trim().max(100),
  example_en: z.string().trim().max(300),
  synonyms: z.array(z.string().trim().min(1).max(60)).max(5),
  cefr: z.enum(CEFR_LEVELS),
});
export const VocabEnrichOutputSchema = z.object({ items: z.array(VocabEnrichItemSchema).max(20) });
export type VocabEnrichItem = z.infer<typeof VocabEnrichItemSchema>;
