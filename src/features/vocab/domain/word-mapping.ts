import type { NotionPage, NotionValue } from "@/lib/notion/types";
import { CEFR_LEVELS, type PropertyIds, type STUDY_STATUSES } from "./notion-schema";

export type Cefr = (typeof CEFR_LEVELS)[number];
export type StudyStatus = (typeof STUDY_STATUSES)[number];

/** Field limits shared by the Zod schemas, the DB checks and the pull clipping (spec §5.3). */
export const WORD_LIMITS = { term: 200, meaning: 1000, pos: 50, ipa: 200, example: 1000, synonyms: 500, note: 2000, topic: 50, topics: 10 } as const;
export const UNTITLED_TERM = "(제목 없음)";

export type WordFields = {
  term: string;
  meaning: string | null;
  pos: string | null;
  ipa: string | null;
  example: string | null;
  synonyms: string | null;
  note: string | null;
  topics: string[];
  cefr: Cefr | null;
};

const TEXT_KEYS = ["meaning", "ipa", "example", "synonyms", "note"] as const;

export function normalizeTerm(term: string): string {
  return term.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Trim, drop commas (Notion rejects them in option names), clip, dedupe, cap the count. */
export function normalizeTopics(names: string[]): string[] {
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.replaceAll(",", "").trim().slice(0, WORD_LIMITS.topic);
    if (name && !out.includes(name)) out.push(name);
    if (out.length === WORD_LIMITS.topics) break;
  }
  return out;
}

function text(value: NotionValue | undefined): string | null {
  return value && (value.type === "title" || value.type === "rich_text") ? value.text : null;
}

function clip(value: string | null, max: number): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function choice(value: NotionValue | undefined): string | null {
  return value && (value.type === "select" || value.type === "status") ? value.name : null;
}

/** Notion page → mirror fields. Never throws on user content: clips, normalizes and drops what doesn't fit. */
export function pageToWordFields(page: NotionPage, ids: PropertyIds): WordFields & { notionStatus: string | null } {
  const props = page.properties;
  const cefr = choice(props[ids.cefr]);
  const topics = props[ids.topics];
  return {
    term: clip(text(props[ids.term]), WORD_LIMITS.term) ?? UNTITLED_TERM,
    meaning: clip(text(props[ids.meaning]), WORD_LIMITS.meaning),
    pos: clip(choice(props[ids.pos]), WORD_LIMITS.pos),
    ipa: clip(text(props[ids.ipa]), WORD_LIMITS.ipa),
    example: clip(text(props[ids.example]), WORD_LIMITS.example),
    synonyms: clip(text(props[ids.synonyms]), WORD_LIMITS.synonyms),
    note: clip(text(props[ids.note]), WORD_LIMITS.note),
    topics: topics?.type === "multi_select" ? normalizeTopics(topics.names) : [],
    cefr: (CEFR_LEVELS as readonly string[]).includes(cefr ?? "") ? (cefr as Cefr) : null,
    notionStatus: choice(props[ids.status]),
  };
}

/** Mirror fields → Notion values for exactly the keys present in the patch. */
export function wordToValues(patch: Partial<WordFields> & { status?: StudyStatus }, ids: PropertyIds): Record<string, NotionValue> {
  const values: Record<string, NotionValue> = {};
  if (patch.term !== undefined) values[ids.term] = { type: "title", text: patch.term };
  for (const key of TEXT_KEYS) {
    const v = patch[key];
    if (v !== undefined) values[ids[key]] = { type: "rich_text", text: v ?? "" };
  }
  if (patch.pos !== undefined) values[ids.pos] = { type: "select", name: patch.pos };
  if (patch.cefr !== undefined) values[ids.cefr] = { type: "select", name: patch.cefr };
  if (patch.topics !== undefined) values[ids.topics] = { type: "multi_select", names: patch.topics };
  if (patch.status !== undefined) values[ids.status] = { type: "status", name: patch.status };
  return values;
}

/** The subset of `next` that differs from `current` (only these are PATCHed, spec §6.1). */
export function changedFields(current: WordFields, next: Partial<WordFields>): Partial<WordFields> {
  const out: Partial<WordFields> = {};
  for (const key of Object.keys(next) as (keyof WordFields)[]) {
    const a = current[key];
    const b = next[key];
    if (b === undefined) continue;
    const same = Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((x, i) => x === b[i]) : a === b;
    if (!same) (out as Record<string, unknown>)[key] = b;
  }
  return out;
}
