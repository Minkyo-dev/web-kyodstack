import "server-only";
import { callAi } from "@/features/ai/services/budget.service";
import { VocabEnrichOutputSchema } from "../ai/enrich.schema";
import { VOCAB_ENRICH_SYSTEM, VOCAB_ENRICH_TASK, vocabEnrichPrompt } from "../ai/enrich.prompt";
import { matchEnrichment, type Enrichment } from "../domain/enrich";
import { normalizeTerm } from "../domain/word-mapping";
import type { VocabCtx } from "./connection.service";

export type TermSuggestion = Enrichment & { term: string };

/** One budgeted call (pool `vocab`) for up to 20 terms; returns suggestions in input order (spec §9.2). */
export async function enrichTerms(ctx: VocabCtx, terms: string[]): Promise<TermSuggestion[]> {
  const { data } = await callAi(ctx, "vocab.word.enrich", {
    task: VOCAB_ENRICH_TASK,
    system: VOCAB_ENRICH_SYSTEM,
    prompt: vocabEnrichPrompt(terms),
    schema: VocabEnrichOutputSchema,
    effort: "low",
  });
  const found = matchEnrichment(terms, data.items);
  return terms.flatMap((term) => {
    const s = found.get(normalizeTerm(term));
    return s ? [{ term, ...s }] : [];
  });
}
