import { AppError } from "@/lib/errors";
import type { NotionPropertyInfo, NotionPropertySpec } from "@/lib/notion/types";

/** The Notion DB the app creates (spec §5.3). Properties are tracked by id, so renames in Notion are harmless. */
export const VOCAB_SCHEMA_VERSION = 1;
export const VOCAB_DB_TITLE = "Kyod 단어장";
export const POS_OPTIONS = ["명사", "동사", "형용사", "부사", "구동사", "숙어", "기타"] as const;
export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export const STUDY_STATUSES = ["새 단어", "학습 중", "학습 완료"] as const;

export const VOCAB_PROPERTIES = [
  { key: "term", name: "단어", type: "title" },
  { key: "meaning", name: "뜻", type: "rich_text" },
  { key: "pos", name: "품사", type: "select", options: POS_OPTIONS },
  { key: "ipa", name: "발음", type: "rich_text" },
  { key: "example", name: "예문", type: "rich_text" },
  { key: "synonyms", name: "유의어", type: "rich_text" },
  { key: "note", name: "메모", type: "rich_text" },
  { key: "topics", name: "주제", type: "multi_select" },
  { key: "cefr", name: "레벨", type: "select", options: CEFR_LEVELS },
  { key: "status", name: "상태", type: "status", options: STUDY_STATUSES },
  { key: "nextReview", name: "다음 복습", type: "date" },
] as const satisfies readonly (NotionPropertySpec & { key: string })[];

export type VocabPropertyKey = (typeof VOCAB_PROPERTIES)[number]["key"];
export type PropertyIds = Record<VocabPropertyKey, string>;
export type SchemaIssue = { key: VocabPropertyKey; name: string; problem: "missing" | "wrong_type" };
export type RepairPlan = { key: VocabPropertyKey; spec: NotionPropertySpec }[];

function specFor(key: VocabPropertyKey) {
  return VOCAB_PROPERTIES.find((p) => p.key === key)!;
}

export function parsePropertyIds(raw: unknown): PropertyIds | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const ids = {} as PropertyIds;
  for (const { key } of VOCAB_PROPERTIES) {
    const value = record[key];
    if (typeof value !== "string" || value.length === 0) return null;
    ids[key] = value;
  }
  return ids;
}

export function mapCreatedProperties(actual: NotionPropertyInfo[]): PropertyIds {
  const ids = {} as PropertyIds;
  for (const spec of VOCAB_PROPERTIES) {
    const hit = actual.find((p) => p.name === spec.name && p.type === spec.type);
    if (!hit) throw new AppError("NOTION_SCHEMA_MISMATCH");
    ids[spec.key] = hit.id;
  }
  return ids;
}

export function checkSchema(ids: PropertyIds, actual: NotionPropertyInfo[]): SchemaIssue[] {
  return VOCAB_PROPERTIES.flatMap((spec): SchemaIssue[] => {
    const hit = actual.find((p) => p.id === ids[spec.key]);
    if (!hit) return [{ key: spec.key, name: spec.name, problem: "missing" }];
    if (hit.type !== spec.type) return [{ key: spec.key, name: spec.name, problem: "wrong_type" }];
    return [];
  });
}

/** One replacement per issue; a taken name gets " 2", " 3", … Title issues are skipped (a DB always has one title). */
export function planRepair(issues: SchemaIssue[], actual: NotionPropertyInfo[]): RepairPlan {
  const taken = new Set(actual.map((p) => p.name));
  return issues
    .filter((issue) => issue.key !== "term")
    .map((issue) => {
      const spec = specFor(issue.key);
      let name: string = spec.name;
      for (let n = 2; taken.has(name); n++) name = `${spec.name} ${n}`;
      taken.add(name);
      return { key: issue.key, spec: { name, type: spec.type, options: "options" in spec ? spec.options : undefined } };
    });
}

export function applyRepair(ids: PropertyIds, plan: RepairPlan, after: NotionPropertyInfo[]): PropertyIds {
  const next = { ...ids };
  for (const { key, spec } of plan) {
    const hit = after.find((p) => p.name === spec.name && p.type === spec.type);
    if (!hit) throw new AppError("NOTION_SCHEMA_MISMATCH");
    next[key] = hit.id;
  }
  return next;
}
