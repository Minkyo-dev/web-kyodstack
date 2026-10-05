import { describe, expect, it } from "vitest";
import {
  applyRepair, checkSchema, mapCreatedProperties, parsePropertyIds, planRepair, VOCAB_PROPERTIES, type PropertyIds,
} from "@/features/vocab/domain/notion-schema";
import type { NotionPropertyInfo } from "@/lib/notion/types";

const created: NotionPropertyInfo[] = VOCAB_PROPERTIES.map((p, i) => ({ id: p.type === "title" ? "title" : `id${i}`, name: p.name, type: p.type }));

describe("vocab Notion schema v1 (spec §5.3)", () => {
  it("defines the eleven properties with their Notion types", () => {
    expect(VOCAB_PROPERTIES.map((p) => [p.name, p.type])).toEqual([
      ["단어", "title"], ["뜻", "rich_text"], ["품사", "select"], ["발음", "rich_text"], ["예문", "rich_text"],
      ["유의어", "rich_text"], ["메모", "rich_text"], ["주제", "multi_select"], ["레벨", "select"], ["상태", "status"],
      ["다음 복습", "date"],
    ]);
    expect(VOCAB_PROPERTIES.find((p) => p.key === "status")).toMatchObject({ options: ["새 단어", "학습 중", "학습 완료"] });
    expect(VOCAB_PROPERTIES.find((p) => p.key === "cefr")).toMatchObject({ options: ["A1", "A2", "B1", "B2", "C1", "C2"] });
  });

  it("maps created properties to ids by name and type", () => {
    const ids = mapCreatedProperties(created);
    expect(ids.term).toBe("title");
    expect(ids.nextReview).toBe("id10");
  });

  it("refuses a created DB that lacks a property", () => {
    expect(() => mapCreatedProperties(created.filter((p) => p.name !== "상태"))).toThrow(expect.objectContaining({ code: "NOTION_SCHEMA_MISMATCH" }));
  });

  it("tracks properties by id, so a rename in Notion is not a problem", () => {
    const ids = mapCreatedProperties(created);
    const renamed = created.map((p) => (p.id === ids.meaning ? { ...p, name: "Meaning" } : p));
    expect(checkSchema(ids, renamed)).toEqual([]);
  });

  it("reports deleted and retyped properties", () => {
    const ids = mapCreatedProperties(created);
    const actual = created.filter((p) => p.id !== ids.meaning).map((p) => (p.id === ids.cefr ? { ...p, type: "rich_text" } : p));
    expect(checkSchema(ids, actual)).toEqual([
      { key: "meaning", name: "뜻", problem: "missing" },
      { key: "cefr", name: "레벨", problem: "wrong_type" },
    ]);
  });

  it("plans replacements with names that do not collide, then adopts their ids", () => {
    const ids = mapCreatedProperties(created);
    const actual = created.filter((p) => p.id !== ids.meaning).map((p) => (p.id === ids.cefr ? { ...p, type: "rich_text" } : p));
    const plan = planRepair(checkSchema(ids, actual), actual);
    expect(plan).toEqual([
      { key: "meaning", spec: { name: "뜻", type: "rich_text", options: undefined } },
      { key: "cefr", spec: { name: "레벨 2", type: "select", options: ["A1", "A2", "B1", "B2", "C1", "C2"] } },
    ]);
    const after = [...actual, { id: "new-meaning", name: "뜻", type: "rich_text" }, { id: "new-cefr", name: "레벨 2", type: "select" }];
    const next: PropertyIds = applyRepair(ids, plan, after);
    expect(next.meaning).toBe("new-meaning");
    expect(next.cefr).toBe("new-cefr");
    expect(checkSchema(next, after)).toEqual([]);
  });

  it("parses stored ids and rejects incomplete objects", () => {
    const ids = mapCreatedProperties(created);
    expect(parsePropertyIds(JSON.parse(JSON.stringify(ids)))).toEqual(ids);
    expect(parsePropertyIds({ term: "title" })).toBeNull();
    expect(parsePropertyIds(null)).toBeNull();
  });
});
