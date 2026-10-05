import { AppError } from "@/lib/errors";
import type { Cefr } from "./word-mapping";

export const MAX_ATTEMPTS = 3;
export const PRACTICE_SIZES = { min: 5, max: 10 } as const;
export const PRACTICE_SOURCES = ["topic", "reviewed_today", "hard", "manual"] as const;
export type PracticeSource = (typeof PRACTICE_SOURCES)[number];
export type PracticeWord = { id: string; term: string; meaning: string | null; pos: string | null; lapses: number };
export type WordRef = { ref: string; word: PracticeWord };
export type GeneratedItem = { target_refs: string[]; prompt_ko: string; hint_ko: string };
export type ValidItem = { targetWordIds: string[]; promptKo: string; hintKo: string | null };

/** Code picks the set (spec §9.3): hard words by lapses, otherwise a random sample; fewer candidates → all of them. */
export function pickPracticeWords(candidates: PracticeWord[], opts: { source: PracticeSource; size: number; random?: () => number }): PracticeWord[] {
  if (opts.source === "hard") return [...candidates].sort((a, b) => b.lapses - a.lapses || a.term.localeCompare(b.term)).slice(0, opts.size);
  const random = opts.random ?? Math.random;
  const pool = [...candidates];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, opts.size);
}

/** Short refs (w1, w2, …) instead of UUIDs in the prompt; code maps them back. */
export function refsFor(words: PracticeWord[]): WordRef[] {
  return words.map((word, i) => ({ ref: `w${i + 1}`, word }));
}

const TWO_TARGET_LEVELS: readonly Cefr[] = ["B2", "C1", "C2"];

/**
 * Guard for generated sentences: only known refs, every word used at least once, Korean text; a second target only
 * from B2 up (dropped below). Anything else invalidates the whole reply, so nothing half-made is saved.
 */
export function validateGenerated(refs: WordRef[], items: GeneratedItem[], level: Cefr): ValidItem[] {
  const byRef = new Map(refs.map((r) => [r.ref, r.word.id]));
  const covered = new Set<string>();
  const out = items.slice(0, refs.length).map((item) => {
    if (!/[가-힣]/.test(item.prompt_ko)) throw new AppError("AI_OUTPUT_INVALID");
    const ids = [...new Set(item.target_refs)].map((ref) => {
      const id = byRef.get(ref);
      if (!id) throw new AppError("AI_OUTPUT_INVALID");
      return id;
    });
    const targetWordIds = TWO_TARGET_LEVELS.includes(level) ? ids.slice(0, 2) : ids.slice(0, 1);
    targetWordIds.forEach((id) => covered.add(id));
    return { targetWordIds, promptKo: item.prompt_ko.trim(), hintKo: item.hint_ko.trim() || null };
  });
  if (refs.some((r) => !covered.has(r.word.id))) throw new AppError("AI_OUTPUT_INVALID");
  return out;
}
