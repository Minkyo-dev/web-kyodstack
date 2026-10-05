"use client";

import { toast } from "sonner";
import { enrichWordsAction } from "../actions/word.actions";
import type { TermSuggestion } from "../services/enrich.service";

/** [AI 채우기] for one term: a suggestion or null (errors and empty replies are toasted). */
export async function suggestFor(term: string): Promise<TermSuggestion | null> {
  const res = await enrichWordsAction({ terms: [term] });
  if (!res.ok) {
    toast.error(res.message);
    return null;
  }
  if (!res.data[0]) toast.message("이 단어에 대한 제안을 찾지 못했어요.");
  return res.data[0] ?? null;
}
