export type DiffPart = { type: "same" | "del" | "add"; text: string };

function tokenize(s: string): string[] {
  return s.match(/[\p{L}\p{N}'’-]+|[^\s\p{L}\p{N}]/gu) ?? [];
}

/** Word-level diff (LCS over tokens) from the learner's answer to the corrected sentence (spec §9.3). */
export function wordDiff(from: string, to: string): DiffPart[] {
  const a = tokenize(from);
  const b = tokenize(to);
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  }
  const out: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ type: "same", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) out.push({ type: "del", text: a[i++] });
    else out.push({ type: "add", text: b[j++] });
  }
  while (i < a.length) out.push({ type: "del", text: a[i++] });
  while (j < b.length) out.push({ type: "add", text: b[j++] });
  return out;
}

/** Whether a rendered token gets a space before it (none before closing punctuation or a possessive). */
export function spaceBefore(token: string): boolean {
  return !/^([.,!?;:%)\]}"”’]|'s\b)/.test(token);
}
