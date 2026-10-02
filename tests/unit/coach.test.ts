import { describe, expect, it } from "vitest";
import { coachProposals, HabitDaysPayload, RuleMinutesPayload, weekdayRates, type CoachInput } from "@/features/assistant/domain/coach";

const P = "0b7c8a3e-5f1d-4c2a-9e6b-1d2f3a4b5c6d";
const H = "1c8d9b4f-6a2e-4d3b-8f7c-2e3a4b5c6d7e";
const M = "2d9e0c5a-7b3f-4e4c-9a8d-3f4b5c6d7e8f";
// 2026-09-04 .. 2026-10-02 (exclusive): 28 days, 4 of each weekday.
const base: CoachInput = { windowStart: "2026-09-04", windowEnd: "2026-10-02", protocols: [], habits: [], signals: [], quiet: new Set() };
const rule = (over: Partial<CoachInput["protocols"][number]> = {}) => ({
  id: P,
  title: "쉐도잉",
  intendedMinutes: 40,
  sessionMinutes: [12, 15, 18],
  focusHabits: [],
  ...over,
});

describe("rule_minutes", () => {
  it("shrinks the rule to the median, rounded to 5, and carries larger focus habit targets", () => {
    const [d] = coachProposals({ ...base, protocols: [rule({ focusHabits: [{ id: H, targetMinutes: 40 }, { id: M, targetMinutes: 10 }] })] });
    expect(d).toMatchObject({ kind: "rule_minutes", targetKey: P, focus: true, title: "'쉐도잉' 40분 → 15분" });
    expect(RuleMinutesPayload.parse(d.payload)).toEqual({ protocolId: P, from: 40, to: 15, habits: [{ id: H, from: 40, to: 15 }] });
    expect(d.evidence).toEqual({ sessions: 3, medianMinutes: 15, intendedMinutes: 40 });
  });
  it("needs 3 sessions and a median under 60% of the intent; never below 5", () => {
    expect(coachProposals({ ...base, protocols: [rule({ sessionMinutes: [10, 10] })] })).toEqual([]);
    expect(coachProposals({ ...base, protocols: [rule({ sessionMinutes: [24, 24, 24] })] })).toEqual([]); // 60% exactly
    expect(coachProposals({ ...base, protocols: [rule({ intendedMinutes: null })] })).toEqual([]);
    const [d] = coachProposals({ ...base, protocols: [rule({ intendedMinutes: 20, sessionMinutes: [1, 2, 2] })] });
    expect((d.payload as { to: number }).to).toBe(5);
  });
});

describe("habit_days", () => {
  const habit = (checkedDates: string[], over = {}) => ({ id: H, title: "스트레칭", weekdays: [1, 2, 3, 4, 5], createdDate: "2026-08-01", checkedDates, ...over });
  // Mondays in the window: 09-07, 14, 21, 28. Wednesdays: 09-09, 16, 23, 30.
  const mondays = ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"];
  it("keeps the weekdays held at least half the time", () => {
    const [d] = coachProposals({ ...base, habits: [habit([...mondays, "2026-09-09", "2026-09-16"])] });
    expect(d).toMatchObject({ kind: "habit_days", title: "'스트레칭' 평일 → 월 수" });
    expect(HabitDaysPayload.parse(d.payload)).toEqual({ habitId: H, from: [1, 2, 3, 4, 5], to: [1, 3] });
    expect(d.evidence).toEqual({ done: 6, due: 20 });
  });
  it("falls back to the single best weekday, and skips habits doing fine or too new", () => {
    const [d] = coachProposals({ ...base, habits: [habit(["2026-09-08"])] });
    expect((d.payload as { to: number[] }).to).toEqual([2]);
    const fine = ["07", "08", "09", "10", "11", "14", "15", "16", "17", "18", "21"].map((x) => `2026-09-${x}`);
    expect(coachProposals({ ...base, habits: [habit(fine)] })).toEqual([]);
    expect(coachProposals({ ...base, habits: [habit([], { createdDate: "2026-09-28" })] })).toEqual([]); // 4 due days
  });
  it("counts only scheduled days per weekday", () => {
    const r = weekdayRates([1, 3], "2026-09-04", "2026-10-02", new Set(mondays));
    expect(r.get(1)).toEqual({ due: 4, done: 4 });
    expect(r.get(3)).toEqual({ due: 4, done: 0 });
    expect(r.has(2)).toBe(false);
  });
});

describe("ordering and suppression", () => {
  const signals: CoachInput["signals"] = [
    { missionId: M, missionTitle: "영어", layer: "goal", evidence: { paceGap: 0.3 } },
    { missionId: M, missionTitle: "영어", layer: "planning", evidence: { missedOrSkipped: 4, blocks: 6 } },
    { missionId: M, missionTitle: "영어", layer: "tactic", evidence: { habitRate: 0.3, habitDone: 3, habitScheduled: 10 } },
  ];
  it("concrete fixes first, then reviews lowest layer first; at most 3; the first is the focus", () => {
    const out = coachProposals({ ...base, protocols: [rule()], signals });
    expect(out.map((d) => `${d.kind}:${d.targetKey}`)).toEqual(["rule_minutes:" + P, `review:${M}:planning`, `review:${M}:goal`]);
    expect(out.map((d) => d.focus)).toEqual([true, false, false]);
    expect(out[1].payload).toEqual({ missionId: M, layer: "planning", href: "/scheduler" });
    expect(out[2].payload).toMatchObject({ href: `/scheduler/directive?mission=${M}#mission-detail` });
  });
  it("a tactic signal becomes a review only when no concrete fix exists", () => {
    expect(coachProposals({ ...base, signals: [signals[2]] })[0]).toMatchObject({ kind: "review", targetKey: `${M}:tactic`, focus: true });
  });
  it("recently dismissed kind+target is not proposed again", () => {
    const out = coachProposals({ ...base, protocols: [rule()], signals: [signals[0]], quiet: new Set([`rule_minutes:${P}`]) });
    expect(out.map((d) => d.kind)).toEqual(["review"]);
    expect(out[0].focus).toBe(true);
  });
});

describe("habit_days wording", () => {
  it("a habit never kept is restarted on one day, not 'kept days'", () => {
    const [d] = coachProposals({ ...base, habits: [{ id: H, title: "독서", weekdays: [1, 2, 3, 4, 5, 6, 7], createdDate: "2026-08-01", checkedDates: [] }] });
    expect(d.reason).toContain("하루로 줄여");
    expect((d.payload as { to: number[] }).to).toEqual([1]);
  });
});
