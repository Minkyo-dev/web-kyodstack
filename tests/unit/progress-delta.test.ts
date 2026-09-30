import { describe, expect, it } from "vitest";
import { deltaFrom } from "@/features/gamification/utils/delta";

const ev = (rule: "focus" | "completion" | "commitment", xp: number) => ({ rule, sourceType: "task" as const, sourceId: "x", localDate: "2026-09-30", xp, metadata: {} });

describe("deltaFrom", () => {
  it("is null when nothing was earned", () => {
    expect(deltaFrom([], { total_xp: 10, level: 1, previous_level: 1 })).toBeNull();
    expect(deltaFrom([ev("focus", 5)], null)).toEqual({ xp: [{ rule: "focus", xp: 5 }], levelUp: null });
  });
  it("sums per rule and reports a level-up", () => {
    expect(deltaFrom([ev("focus", 5), ev("focus", 7), ev("completion", 20)], { total_xp: 160, level: 2, previous_level: 1 })).toEqual({
      xp: [{ rule: "focus", xp: 12 }, { rule: "completion", xp: 20 }],
      levelUp: { from: 1, to: 2 },
    });
  });
});
