import { describe, expect, it } from "vitest";
import { levelFor, mergeLevelUp, practiceLevel, rankFor } from "@/features/gamification/utils/level";

describe("levelFor", () => {
  it("level 1 needs 150, level 2 needs 200", () => {
    expect(levelFor(0)).toEqual({ level: 1, into: 0, need: 150 });
    expect(levelFor(149)).toEqual({ level: 1, into: 149, need: 150 });
    expect(levelFor(150)).toEqual({ level: 2, into: 0, need: 200 });
    expect(levelFor(349)).toEqual({ level: 2, into: 199, need: 200 });
    expect(levelFor(350)).toEqual({ level: 3, into: 0, need: 250 });
  });
  it("treats negative/fractional totals safely", () => {
    expect(levelFor(-5)).toEqual({ level: 1, into: 0, need: 150 });
    expect(levelFor(150.9).level).toBe(2);
  });
});

describe("practiceLevel", () => {
  it("floor(sqrt(hours)) + 1", () => {
    expect(practiceLevel(0)).toBe(1);
    expect(practiceLevel(59)).toBe(1);
    expect(practiceLevel(60)).toBe(2);
    expect(practiceLevel(4 * 60 - 1)).toBe(2);
    expect(practiceLevel(4 * 60)).toBe(3);
    expect(practiceLevel(324 * 60)).toBe(19);
  });
});

describe("mergeLevelUp", () => {
  it("keeps the first 'from' and the latest 'to'", () => {
    expect(mergeLevelUp(null, { from: 5, to: 6 })).toEqual({ from: 5, to: 6 });
    expect(mergeLevelUp({ from: 5, to: 6 }, { from: 6, to: 7 })).toEqual({ from: 5, to: 7 });
    expect(mergeLevelUp({ from: 5, to: 6 }, null)).toEqual({ from: 5, to: 6 });
  });
});

describe("rankFor", () => {
  it("one rank per 10 levels, E to S", () => {
    expect([1, 9, 10, 19, 20, 30, 40, 49, 50, 99].map(rankFor)).toEqual(["E", "E", "D", "D", "C", "B", "A", "A", "S", "S"]);
  });
});
