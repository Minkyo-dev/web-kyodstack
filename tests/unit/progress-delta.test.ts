import { describe, expect, it } from "vitest";
import { deltaFrom } from "@/features/gamification/utils/delta";

const ev = (rule: "focus" | "completion" | "commitment" | "quest", xp: number) => ({ rule, sourceType: "task" as const, sourceId: "x", localDate: "2026-09-30", xp, metadata: {} });

describe("deltaFrom", () => {
  it("is null when nothing was earned", () => {
    expect(deltaFrom([], [{ total_xp: 10, level: 1, previous_level: 1 }])).toBeNull();
    expect(deltaFrom([ev("focus", 5)], [])).toEqual({ xp: [{ rule: "focus", xp: 5 }], levelUp: null });
  });
  it("sums per rule and reports a level-up", () => {
    expect(deltaFrom([ev("focus", 5), ev("focus", 7), ev("completion", 20)], [{ total_xp: 160, level: 2, previous_level: 1 }])).toEqual({
      xp: [{ rule: "focus", xp: 12 }, { rule: "completion", xp: 20 }],
      levelUp: { from: 1, to: 2 },
    });
  });
});

describe("deltaFrom with quests and achievements", () => {
  it("combines awards: first previous level, last level", () => {
    const d = deltaFrom([ev("focus", 5), ev("quest", 50)], [
      { total_xp: 140, level: 1, previous_level: 1 },
      { total_xp: 190, level: 2, previous_level: 1 },
    ], { questsCleared: [{ type: "daily", title: "모멘텀 쌓기", xp: 50 }] });
    expect(d?.levelUp).toEqual({ from: 1, to: 2 });
    expect(d?.questsCleared).toEqual([{ type: "daily", title: "모멘텀 쌓기", xp: 50 }]);
  });
  it("reports achievements even without XP", () => {
    expect(deltaFrom([], [], { achievements: [{ key: "first_step", name: "FIRST STEP" }] })).toEqual({
      xp: [], levelUp: null, questsCleared: [], achievements: [{ key: "first_step", name: "FIRST STEP" }],
    });
  });
});
