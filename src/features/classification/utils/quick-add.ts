/** Quick-add syntax (D1 spec §3): "#tag" and "@domain" tokens at a word start. Pure. */
import type { DomainRef } from "../domain/classification.types";

const TOKEN = /(^|\s)([#@])([\p{L}\p{N}_-]+)/gu;

export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function parseQuickAdd(input: string): { title: string; tags: string[]; domain: string | null } {
  const tags: string[] = [];
  let domain: string | null = null;
  const title = input
    .replace(TOKEN, (_m, lead: string, kind: string, name: string) => {
      if (kind === "#") {
        if (!tags.some((t) => sameName(t, name))) tags.push(name);
      } else {
        domain = name;
      }
      return lead;
    })
    .replace(/\s+/g, " ")
    .trim();
  return { title, tags, domain };
}

/** The "#…" / "@…" token being typed at `caret`, for autocomplete. */
export function activeToken(input: string, caret: number): { kind: "#" | "@"; query: string; start: number } | null {
  const before = input.slice(0, caret);
  const m = /(^|\s)([#@])([\p{L}\p{N}_-]*)$/u.exec(before);
  if (!m) return null;
  return { kind: m[2] as "#" | "@", query: m[3], start: before.length - m[3].length - 1 };
}

/** True when `newParentId` is `id` itself or one of its descendants. */
export function wouldCycle(domains: DomainRef[], id: string, newParentId: string | null): boolean {
  let cur = newParentId;
  const byId = new Map(domains.map((d) => [d.id, d]));
  for (let guard = 0; cur && guard < 1000; guard++) {
    if (cur === id) return true;
    cur = byId.get(cur)?.parent_id ?? null;
  }
  return false;
}
