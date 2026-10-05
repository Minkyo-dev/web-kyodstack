import { sanitizeForPrompt } from "@/features/ai/utils/prompt-input";

export const VOCAB_ENRICH_PROMPT_VERSION = "vocab-enrich-v1";
export const VOCAB_ENRICH_TASK = "vocab_enrich";
export const VOCAB_ENRICH_SYSTEM = [
  "You are a precise English–Korean lexicographer filling a Korean learner's vocabulary notebook.",
  "For each English term, return:",
  "- meaning_ko: the most common Korean meaning(s), concise, at most three senses separated by commas;",
  "- pos: exactly one of 명사, 동사, 형용사, 부사, 구동사, 숙어, 기타;",
  "- ipa: American pronunciation in IPA between slashes;",
  "- example_en: one natural English sentence of at most 20 words that uses the exact term;",
  "- synonyms: up to five English synonyms (may be empty);",
  "- cefr: the CEFR level (A1–C2) at which a learner typically meets the term.",
  "Echo each term exactly as given. Skip anything that is not an English word or expression. Never add terms.",
].join("\n");

export function vocabEnrichPrompt(terms: string[]): string {
  return `Terms (JSON array):\n${JSON.stringify(terms.map((t) => sanitizeForPrompt(t, 200)))}`;
}
