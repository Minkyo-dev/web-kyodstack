import { describe, expect, it } from "vitest";
import { BULK_MAX_LINES, parseBulk } from "@/features/vocab/domain/bulk-parse";
import { createThrottle } from "@/lib/notion/throttle";

describe("parseBulk (spec §9.2)", () => {
  it("splits each line at its first separator and keeps terms without a meaning", () => {
    const text = ["ubiquitous - 어디에나 있는", "run out of\t~이 다 떨어지다", "note : 메모: 짧은 글", "well-known – 잘 알려진", "serendipity", "", "   ", "a:b"].join("\n");
    expect(parseBulk(text, new Set()).rows).toEqual([
      { line: 1, term: "ubiquitous", meaning: "어디에나 있는", duplicate: null },
      { line: 2, term: "run out of", meaning: "~이 다 떨어지다", duplicate: null },
      { line: 3, term: "note", meaning: "메모: 짧은 글", duplicate: null },
      { line: 4, term: "well-known", meaning: "잘 알려진", duplicate: null },
      { line: 5, term: "serendipity", meaning: null, duplicate: null },
      { line: 8, term: "a", meaning: "b", duplicate: null },
    ]);
  });

  it("flags words already in the list and repeats within the paste", () => {
    const { rows } = parseBulk("Alpha - 1\nbeta - 2\nALPHA - 3\nbeta - again", new Set(["beta"]));
    expect(rows.map((r) => r.duplicate)).toEqual([null, "existing", "paste", "existing"]);
  });

  it("caps the paste and reports the overflow", () => {
    const text = Array.from({ length: BULK_MAX_LINES + 50 }, (_, i) => `w${i}`).join("\n");
    const out = parseBulk(text, new Set());
    expect(out.rows).toHaveLength(BULK_MAX_LINES);
    expect(out.overflow).toBe(50);
  });

  it("clips over-long terms and meanings to the field limits", () => {
    const { rows } = parseBulk(`${"x".repeat(250)} - ${"가".repeat(1200)}`, new Set());
    expect(rows[0].term).toHaveLength(200);
    expect(rows[0].meaning).toHaveLength(1000);
  });
});

describe("createThrottle", () => {
  it("spaces calls per key and lets other keys through", async () => {
    let now = 1000;
    const slept: number[] = [];
    const wait = createThrottle(334, () => now, async (ms) => {
      slept.push(ms);
      now += ms;
    });
    await wait("token-a");
    await wait("token-a");
    await wait("token-b");
    now += 1000;
    await wait("token-a");
    expect(slept).toEqual([334]);
  });
});
