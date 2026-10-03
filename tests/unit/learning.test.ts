import { describe, expect, it } from "vitest";
import { learningOutcome, outcomeText, shiftDate, type LearnData } from "@/features/assistant/domain/learning";

const H = "1c8d9b4f-6a2e-4d3b-8f7c-2e3a4b5c6d7e";
const P = "0b7c8a3e-5f1d-4c2a-9e6b-1d2f3a4b5c6d";
const M = "2d9e0c5a-7b3f-4e4c-9a8d-3f4b5c6d7e8f";
const days = (from: string, n: number, step = 1) => Array.from({ length: n }, (_, i) => shiftDate(from, i * step));
const data = (over: Partial<LearnData> = {}): LearnData => ({ habits: new Map(), sessionDates: new Map(), ...over });
// Decided Thursday 2026-09-03. Before window 08-06..09-02; after 09-03..09-30.
const D = "2026-09-03";

describe("learn-v1 habit_days", () => {
  const entry = { id: "e", kind: "habit_days", title: "t", decidedDate: D, payload: { habitId: H, from: [1, 2, 3, 4, 5], to: [1] } };
  // Mondays: before 08-10,17,24,31 (4); after 09-07,14,21,28 (4).
  const mondaysBefore = days("2026-08-10", 4, 7);
  const mondaysAfter = days("2026-09-07", 4, 7);
  it("compares the old weekdays before with the new weekdays after", () => {
    const o = learningOutcome(entry, data({ habits: new Map([[H, { createdDate: "2026-07-01", checkedDates: new Set([...mondaysBefore, ...mondaysAfter]) }]]) }), "2026-10-02");
    // before: 4 of 20 weekdays = 20%; after: 4/4.
    expect(o).toEqual({ state: "result", measure: "rate", before: 0.2, after: 1, verdict: "better" });
    expect(outcomeText(o)).toBe("지킴 20% → 100% · 좋아짐");
  });
  it("watches for 14 days, and needs 4 due days on each side", () => {
    expect(learningOutcome(entry, data(), "2026-09-10")).toEqual({ state: "watching", daysLeft: 7 });
    const young = data({ habits: new Map([[H, { createdDate: "2026-09-01", checkedDates: new Set() }]]) });
    expect(learningOutcome(entry, young, "2026-10-02")).toEqual({ state: "thin" }); // 2 due days before
    expect(learningOutcome(entry, data(), "2026-10-02")).toEqual({ state: "thin" }); // habit gone
  });
  it("the after window stops at 28 days", () => {
    const h = new Map([[H, { createdDate: "2026-07-01", checkedDates: new Set([...days("2026-08-06", 28), ...mondaysAfter]) }]]);
    const o = learningOutcome(entry, data({ habits: h }), "2026-12-01");
    expect(o).toMatchObject({ before: 1, after: 1, verdict: "same" });
  });
});

describe("learn-v1 sessions per week", () => {
  const rule = { id: "e", kind: "rule_minutes", title: "t", decidedDate: D, payload: { protocolId: P, from: 40, to: 15, habits: [] } };
  const slot = { id: "e", kind: "time_slot", title: "t", decidedDate: D, payload: { protocolId: P, missionId: M, hour: 7, minutes: 30, weekdays: [] } };
  const sessions = (before: number, after: number) =>
    data({ sessionDates: new Map([[P, [...days("2026-08-06", before, 2), ...days(D, after, 2)]]]) });
  it("better, same and worse by the weekly thresholds", () => {
    expect(learningOutcome(rule, sessions(4, 12), "2026-10-01")).toEqual({ state: "result", measure: "weekly", before: 1, after: 3, verdict: "better" });
    expect(learningOutcome(slot, sessions(8, 8), "2026-10-01")).toMatchObject({ verdict: "same" });
    expect(learningOutcome(rule, sessions(8, 4), "2026-10-01")).toMatchObject({ verdict: "worse" });
    expect(learningOutcome(rule, sessions(0, 1), "2026-10-01")).toMatchObject({ verdict: "better" });
    expect(learningOutcome(rule, sessions(0, 0), "2026-10-01")).toMatchObject({ verdict: "same" });
  });
  it("text uses one decimal", () => {
    expect(outcomeText(learningOutcome(rule, sessions(4, 12), "2026-10-01"))).toBe("주당 세션 1.0 → 3.0회 · 좋아짐");
    expect(outcomeText({ state: "watching", daysLeft: 3 })).toBe("지켜보는 중 · 3일 뒤 결과");
  });
});
