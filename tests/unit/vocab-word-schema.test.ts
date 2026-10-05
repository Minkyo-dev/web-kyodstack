import { describe, expect, it } from "vitest";
import { updateWordSchema, wordInputSchema } from "@/features/vocab/schemas/word.schema";
import { escapeLike } from "@/features/vocab/utils/escape-like";

describe("wordInputSchema (spec §5.3 limits)", () => {
  it("trims, turns blanks into null and keeps valid values", () => {
    const parsed = wordInputSchema.parse({ term: "  run out  ", meaning: " 다 떨어지다 ", ipa: "", pos: "구동사", topics: [" 일상 ", "일상", "IT"], cefr: "" });
    expect(parsed).toEqual({ term: "run out", meaning: "다 떨어지다", ipa: null, pos: "구동사", example: null, synonyms: null, note: null, topics: ["일상", "IT"], cefr: null });
  });

  it("rejects what Notion or the mirror cannot hold", () => {
    expect(wordInputSchema.safeParse({ term: "  " }).success).toBe(false);
    expect(wordInputSchema.safeParse({ term: "x".repeat(201) }).success).toBe(false);
    expect(wordInputSchema.safeParse({ term: "x", meaning: "가".repeat(1001) }).success).toBe(false);
    expect(wordInputSchema.safeParse({ term: "x", topics: ["a,b"] }).success).toBe(false);
    expect(wordInputSchema.safeParse({ term: "x", topics: Array.from({ length: 11 }, (_, i) => `t${i}`) }).success).toBe(false);
    expect(wordInputSchema.safeParse({ term: "x", cefr: "B3" }).success).toBe(false);
    expect(wordInputSchema.safeParse({ term: "x", pos: "감탄사" }).success).toBe(false);
  });

  it("updates need a word id and at least one field", () => {
    const id = "6f1c1f9e-1b2a-4c3d-8e4f-5a6b7c8d9e0f";
    expect(updateWordSchema.safeParse({ id, patch: {} }).success).toBe(false);
    expect(updateWordSchema.parse({ id, patch: { meaning: "" } })).toEqual({ id, patch: { meaning: null } });
    expect(updateWordSchema.safeParse({ id: "nope", patch: { meaning: "x" } }).success).toBe(false);
  });
});

describe("escapeLike", () => {
  it("matches %, _ and backslash literally", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  });
});

describe("ilikeAny (PostgREST or-filter)", () => {
  it("quotes the value so commas, parentheses and quotes stay literal", async () => {
    const { ilikeAny } = await import("@/features/vocab/utils/escape-like");
    expect(ilikeAny(["term", "meaning"], 'a,b) "c"\\')).toBe('term.ilike."%a,b) \\"c\\"\\\\\\\\%",meaning.ilike."%a,b) \\"c\\"\\\\\\\\%"');
    expect(ilikeAny(["term"], "50%")).toBe('term.ilike."%50\\\\%%"');
  });
});
