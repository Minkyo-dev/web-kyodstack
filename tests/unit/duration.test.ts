import { describe, expect, it } from "vitest";
import {
  formatMinutes,
  recommendBlockMinutes,
  resolveBaseEstimate,
  roundUpToIncrement,
} from "@/features/scheduler/utils/duration";

const settings = { slot_minutes: 15, min_block_minutes: 15, max_focus_block_minutes: 120 };

describe("roundUpToIncrement", () => {
  it("rounds up to the next slot", () => {
    expect(roundUpToIncrement(61, 15)).toBe(75);
    expect(roundUpToIncrement(60, 15)).toBe(60);
    expect(roundUpToIncrement(78.342, 5)).toBe(80);
  });
  it("never returns less than one increment", () => {
    expect(roundUpToIncrement(0, 15)).toBe(15);
  });
});

describe("resolveBaseEstimate (spec §26.2)", () => {
  it("prefers the user estimate", () => {
    expect(resolveBaseEstimate({ userEstimatedMinutes: 45, templateDefaultMinutes: 90 }))
      .toEqual({ minutes: 45, source: "user" });
  });
  it("falls back to the template default, then 60", () => {
    expect(resolveBaseEstimate({ userEstimatedMinutes: null, templateDefaultMinutes: 90 }).minutes).toBe(90);
    expect(resolveBaseEstimate({ userEstimatedMinutes: null, templateDefaultMinutes: null }))
      .toEqual({ minutes: 60, source: "generic" });
  });
});

describe("recommendBlockMinutes", () => {
  it("uses the base estimate when there is no learned factor", () => {
    expect(recommendBlockMinutes(60, settings)).toBe(60);
  });
  it("applies the correction factor (spec §12 example: 60 × 1.35 → 81 → 90 at 15-min slots)", () => {
    expect(recommendBlockMinutes(60, settings, 1.35)).toBe(90);
    expect(recommendBlockMinutes(60, { ...settings, slot_minutes: 5 }, 1.33)).toBe(80);
  });
  it("clamps to min and max focus block", () => {
    expect(recommendBlockMinutes(5, settings)).toBe(15);
    expect(recommendBlockMinutes(300, settings)).toBe(120);
  });
});

describe("formatMinutes", () => {
  it("formats human-sized durations", () => {
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(60)).toBe("1h");
    expect(formatMinutes(80)).toBe("1h 20m");
  });
});
