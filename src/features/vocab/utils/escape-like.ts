/** Escapes LIKE/ILIKE wildcards so user text matches literally. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}
