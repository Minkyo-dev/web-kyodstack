import { describe, expect, it } from "vitest";
import { matchEnrichment } from "@/features/vocab/domain/enrich";
import { VocabEnrichOutputSchema } from "@/features/vocab/ai/enrich.schema";
import { vocabEnrichPrompt } from "@/features/vocab/ai/enrich.prompt";

const item = (term: string, over = {}) => ({
  term, meaning_ko: "어디에나 있는", pos: "형용사" as const, ipa: "/juːˈbɪkwɪtəs/", example_en: `It is ${term}.`, synonyms: ["omnipresent"], cefr: "C1" as const, ...over,
});

describe("matchEnrichment (spec §9.2)", () => {
  it("keeps suggestions only for the terms that were asked, matched case- and space-insensitively", () => {
    const out = matchEnrichment(["Ubiquitous", "run  out of"], [item("ubiquitous"), item("Run out of", { pos: "구동사", synonyms: [] }), item("invented")]);
    expect([...out.keys()]).toEqual(["ubiquitous", "run out of"]);
    expect(out.get("ubiquitous")).toEqual({ meaning: "어디에나 있는", pos: "형용사", ipa: "/juːˈbɪkwɪtəs/", example: "It is ubiquitous.", synonyms: "omnipresent", cefr: "C1" });
    expect(out.get("run out of")?.synonyms).toBeNull();
  });

  it("turns blank strings into null and rejects a reply that matches nothing", () => {
    expect(matchEnrichment(["x"], [item("x", { ipa: " ", example_en: "" })]).get("x")).toMatchObject({ ipa: null, example: null });
    expect(() => matchEnrichment(["x"], [item("y")])).toThrow(expect.objectContaining({ code: "AI_OUTPUT_INVALID" }));
  });
});

describe("enrich schema and prompt", () => {
  it("accepts a well-formed reply and rejects an unknown part of speech or level", () => {
    expect(VocabEnrichOutputSchema.safeParse({ items: [item("x")] }).success).toBe(true);
    expect(VocabEnrichOutputSchema.safeParse({ items: [item("x", { pos: "감탄사" })] }).success).toBe(false);
    expect(VocabEnrichOutputSchema.safeParse({ items: [item("x", { cefr: "B3" })] }).success).toBe(false);
  });

  it("sends the terms as sanitized JSON", () => {
    expect(vocabEnrichPrompt(["run\u0000 out", "x".repeat(300)])).toBe(`Terms (JSON array):\n${JSON.stringify(["run out", "x".repeat(200)])}`);
  });
});
