import { AppError } from "@/lib/errors";
import type { VocabEnrichItem } from "../ai/enrich.schema";
import type { POS_OPTIONS } from "./notion-schema";
import { normalizeTerm, type Cefr } from "./word-mapping";

export type Enrichment = {
  meaning: string;
  pos: (typeof POS_OPTIONS)[number];
  ipa: string | null;
  example: string | null;
  synonyms: string | null;
  cefr: Cefr;
};

const blankToNull = (s: string) => (s.trim() ? s.trim() : null);

/**
 * Guard for the AI auto-fill (spec §9.2): suggestions keyed by normalized term, only for terms that were asked;
 * invented terms are dropped. A reply that matches nothing is invalid.
 */
export function matchEnrichment(terms: string[], items: VocabEnrichItem[]): Map<string, Enrichment> {
  const wanted = new Set(terms.map(normalizeTerm));
  const out = new Map<string, Enrichment>();
  for (const item of items) {
    const key = normalizeTerm(item.term);
    if (!wanted.has(key) || out.has(key)) continue;
    out.set(key, {
      meaning: item.meaning_ko.trim(),
      pos: item.pos,
      ipa: blankToNull(item.ipa),
      example: blankToNull(item.example_en),
      synonyms: item.synonyms.length ? item.synonyms.join(", ") : null,
      cefr: item.cefr,
    });
  }
  if (terms.length > 0 && out.size === 0) throw new AppError("AI_OUTPUT_INVALID");
  return out;
}
