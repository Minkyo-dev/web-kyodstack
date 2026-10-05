import { describe, expect, it } from "vitest";
import { AI_POOL_CAPS, poolOf } from "@/features/ai/utils/budget-pools";

describe("AI budget pools (ADR 0046, amends 0018)", () => {
  it("gives 단어장 calls their own daily pool", () => {
    expect(poolOf("vocab.word.enrich")).toBe("vocab");
    expect(poolOf("vocab.practice.feedback")).toBe("vocab");
    expect(poolOf("weekly_review")).toBe("default");
    expect(poolOf("vocabulary_misc")).toBe("default");
    expect(AI_POOL_CAPS).toEqual({ default: 30, vocab: 60 });
  });
});
