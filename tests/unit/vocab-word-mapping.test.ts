import { describe, expect, it } from "vitest";
import { VOCAB_PROPERTIES, mapCreatedProperties } from "@/features/vocab/domain/notion-schema";
import { changedFields, normalizeTerm, pageToWordFields, wordToValues, type WordFields } from "@/features/vocab/domain/word-mapping";
import type { NotionPage } from "@/lib/notion/types";

const ids = mapCreatedProperties(VOCAB_PROPERTIES.map((p, i) => ({ id: p.type === "title" ? "title" : `id${i}`, name: p.name, type: p.type })));
const page = (properties: NotionPage["properties"]): NotionPage => ({
  id: "pg", url: "https://www.notion.so/pg", createdTime: "2026-10-05T10:00:00.000Z", lastEditedTime: "2026-10-05T10:00:00.000Z", inTrash: false, properties,
});
const full: WordFields = {
  term: "ubiquitous", meaning: "어디에나 있는", pos: "형용사", ipa: "/juːˈbɪkwɪtəs/", example: "Phones are ubiquitous.",
  synonyms: "omnipresent", note: null, topics: ["IT", "일상"], cefr: "C1",
};

describe("word ⇄ Notion values (spec §5.3)", () => {
  it("round-trips every field through the property ids", () => {
    const values = wordToValues({ ...full, status: "새 단어" }, ids);
    expect(values[ids.status]).toEqual({ type: "status", name: "새 단어" });
    expect(values[ids.note]).toEqual({ type: "rich_text", text: "" });
    expect(pageToWordFields(page(values), ids)).toEqual({ ...full, notionStatus: "새 단어", notionNextReview: null });
  });

  it("reads and writes 다음 복습 as a date", () => {
    expect(wordToValues({ nextReview: "2026-10-08" }, ids)).toEqual({ [ids.nextReview]: { type: "date", start: "2026-10-08" } });
    expect(wordToValues({ nextReview: null }, ids)).toEqual({ [ids.nextReview]: { type: "date", start: null } });
    expect(pageToWordFields(page({ [ids.term]: { type: "title", text: "x" }, [ids.nextReview]: { type: "date", start: "2026-10-08T09:00:00.000-04:00" } }), ids).notionNextReview).toBe("2026-10-08");
  });

  it("sends only the fields in the patch", () => {
    expect(Object.keys(wordToValues({ meaning: "x" }, ids))).toEqual([ids.meaning]);
  });

  it("normalizes what the app would reject instead of failing the sync", () => {
    const fields = pageToWordFields(
      page({
        [ids.term]: { type: "title", text: "   " },
        [ids.meaning]: { type: "rich_text", text: "가".repeat(3000) },
        [ids.cefr]: { type: "select", name: "B3" },
        [ids.pos]: { type: "select", name: "x".repeat(80) },
        [ids.topics]: { type: "multi_select", names: ["IT", "a,b", "", "t".repeat(60), "IT", ...Array.from({ length: 12 }, (_, i) => `k${i}`)] },
        [ids.example]: { type: "rich_text", text: "  " },
      }),
      ids,
    );
    expect(fields.term).toBe("(제목 없음)");
    expect(fields.meaning).toHaveLength(1000);
    expect(fields.cefr).toBeNull();
    expect(fields.pos).toHaveLength(50);
    expect(fields.example).toBeNull();
    expect(fields.topics).toEqual(["IT", "ab", "t".repeat(50), "k0", "k1", "k2", "k3", "k4", "k5", "k6"]);
    expect(fields.notionStatus).toBeNull();
    expect(fields.notionNextReview).toBeNull();
  });

  it("ignores properties that are missing or of another type", () => {
    const fields = pageToWordFields(page({ [ids.term]: { type: "title", text: "run" }, [ids.meaning]: { type: "other" } }), ids);
    expect(fields).toMatchObject({ term: "run", meaning: null, topics: [], cefr: null });
  });
});

describe("changedFields", () => {
  it("keeps only real changes, comparing topics as sets of strings in order", () => {
    expect(changedFields(full, { ...full })).toEqual({});
    expect(changedFields(full, { meaning: "편재하는", topics: ["IT", "일상"], cefr: "C1" })).toEqual({ meaning: "편재하는" });
    expect(changedFields(full, { topics: ["일상"], note: "memo" })).toEqual({ topics: ["일상"], note: "memo" });
  });
});

describe("normalizeTerm", () => {
  it("compares terms case- and space-insensitively", () => {
    expect(normalizeTerm("  Look   Up ")).toBe("look up");
  });
});
