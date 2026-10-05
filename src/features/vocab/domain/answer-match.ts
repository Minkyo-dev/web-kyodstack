/** Lowercase, collapse spaces, strip punctuation at the ends. */
export function normalizeAnswer(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^[\s.,!?;:"'“”‘’]+|[\s.,!?;:"'“”‘’]+$/g, "")
    .toLowerCase();
}

/** Optimal string alignment distance (Damerau–Levenshtein with adjacent transpositions). */
export function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** Typed recall answer → the button to highlight (spec §7.4); the user still decides. Null when nothing was typed. */
export function suggestRating(typed: string, term: string): 1 | 2 | 3 | null {
  const answer = normalizeAnswer(typed);
  if (!answer) return null;
  const expected = normalizeAnswer(term);
  if (answer === expected) return 3;
  if (expected.length >= 4 && editDistance(answer, expected) <= 1) return 2;
  return 1;
}

/** The example with the term blanked for the recall front, or null when the term isn't in it (it would give it away). */
export function blankTerm(example: string | null, term: string): string | null {
  if (!example) return null;
  const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu");
  return pattern.test(example) ? example.replace(pattern, "___") : null;
}
