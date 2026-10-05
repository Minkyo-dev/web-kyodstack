/** Escapes LIKE/ILIKE wildcards so user text matches literally. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * PostgREST `or()` filter matching `text` anywhere in any of `columns`, case-insensitively. The value is LIKE-escaped
 * and then double-quoted (with `\` and `"` escaped), so commas, parentheses and quotes can't change the filter.
 */
export function ilikeAny(columns: string[], text: string): string {
  const quoted = `%${escapeLike(text)}%`.replace(/[\\"]/g, (c) => `\\${c}`);
  return columns.map((column) => `${column}.ilike."${quoted}"`).join(",");
}
