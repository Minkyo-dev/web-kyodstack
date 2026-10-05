import { WORD_LIMITS, normalizeTerm } from "./word-mapping";

export const BULK_MAX_LINES = 200;
export type BulkRow = { line: number; term: string; meaning: string | null; duplicate: "existing" | "paste" | null };

const SEPARATORS = ["\t", " - ", " – ", " — ", " : ", ":"];

function split(line: string): { term: string; meaning: string | null } {
  let at = -1;
  let sep = "";
  for (const s of SEPARATORS) {
    const i = line.indexOf(s);
    if (i > 0 && (at === -1 || i < at)) {
      at = i;
      sep = s;
    }
  }
  if (at === -1) return { term: line.trim(), meaning: null };
  const meaning = line.slice(at + sep.length).trim();
  return { term: line.slice(0, at).trim(), meaning: meaning || null };
}

/**
 * Bulk paste (spec §9.2): one word per line as `term`, `term - meaning`, `term : meaning` or `term<TAB>meaning`
 * (the first separator wins). Duplicates of the word list or within the paste are flagged, not dropped.
 */
export function parseBulk(text: string, existing: ReadonlySet<string>): { rows: BulkRow[]; overflow: number } {
  const lines = text.split(/\r?\n/).map((raw, i) => ({ raw, line: i + 1 })).filter((l) => l.raw.trim());
  const seen = new Set<string>();
  const rows = lines.slice(0, BULK_MAX_LINES).flatMap(({ raw, line }) => {
    const { term, meaning } = split(raw);
    if (!term) return [];
    const clipped = term.slice(0, WORD_LIMITS.term);
    const key = normalizeTerm(clipped);
    const duplicate = existing.has(key) ? "existing" : seen.has(key) ? "paste" : null;
    seen.add(key);
    return [{ line, term: clipped, meaning: meaning ? meaning.slice(0, WORD_LIMITS.meaning) : null, duplicate } as BulkRow];
  });
  return { rows, overflow: Math.max(0, lines.length - BULK_MAX_LINES) };
}
