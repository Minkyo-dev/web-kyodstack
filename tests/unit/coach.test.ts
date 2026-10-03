import { describe, expect, it } from "vitest";
import { coachProposals, HabitDaysPayload, RuleMinutesPayload, weekdayRates, type CoachInput } from "@/features/assistant/domain/coach";

const P = "0b7c8a3e-5f1d-4c2a-9e6b-1d2f3a4b5c6d";
const H = "1c8d9b4f-6a2e-4d3b-8f7c-2e3a4b5c6d7e";
const M = "2d9e0c5a-7b3f-4e4c-9a8d-3f4b5c6d7e8f";
// 2026-09-04 .. 2026-10-02 (exclusive): 28 days, 4 of each weekday.
const base: CoachInput = { windowStart: "2026-09-04", windowEnd: "2026-10-02", protocols: [], habits: [], signals: [], quiet: new Set(), applied: [] };
const rule = (over: Partial<CoachInput["protocols"][number]> = {}) => ({
  id: P,
  missionId: M,
  title: "쉐도잉",
  intendedMinutes: 40,
  sessionMinutes: [12, 15, 18],
  sessionHours: [] as number[],
  hasUpcomingBlock: false,
  focusHabits: [] as CoachInput["protocols"][number]["focusHabits"],
  ...over,
});

describe("rule_minutes", () => {
  it("shrinks the rule to the median, rounded to 5, and carries larger focus habit targets", () => {
    const [d] = coachProposals({ ...base, protocols: [rule({ focusHabits: [{ id: H, targetMinutes: 40, weekdays: [1] }, { id: M, targetMinutes: 10, weekdays: [1] }] })] });
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

describe("coach-v2 learning (ADR 0044)", () => {
  const cutHabit = { kind: "habit_days", decidedDate: "2026-08-01", payload: { habitId: H, from: [1, 2, 3, 4, 5], to: [1, 3] } };
  const cutRule = { kind: "rule_minutes", decidedDate: "2026-08-01", payload: { protocolId: P, from: 40, to: 15, habits: [] } };
  // Mondays and Wednesdays in the window.
  const monWed = ["07", "09", "14", "16", "21", "23", "28", "30"].map((x) => `2026-09-${x}`);
  const kept = (checkedDates: string[]) => ({ id: H, title: "스트레칭", weekdays: [1, 3], createdDate: "2026-07-01", checkedDates });

  it("a target changed within 28 days is left to settle", () => {
    const recent = { ...cutHabit, decidedDate: "2026-09-20" };
    const weak = { id: H, title: "스트레칭", weekdays: [1, 2, 3, 4, 5], createdDate: "2026-08-01", checkedDates: [] };
    expect(coachProposals({ ...base, habits: [weak], applied: [recent] })).toEqual([]);
    expect(coachProposals({ ...base, protocols: [rule()], applied: [{ ...cutRule, decidedDate: "2026-09-10" }] })).toEqual([]);
    expect(coachProposals({ ...base, protocols: [rule()], applied: [cutRule] })).toHaveLength(1); // old enough
  });

  it("grows a cut habit back one weekday once it is kept ≥ 80%", () => {
    const [d] = coachProposals({ ...base, habits: [kept(monWed)], applied: [cutHabit] });
    expect(d).toMatchObject({ kind: "habit_days", targetKey: `${H}:grow`, title: "'스트레칭' 월 수 → 월 화 수" });
    expect(HabitDaysPayload.parse(d.payload)).toEqual({ habitId: H, from: [1, 3], to: [1, 2, 3] });
    expect(coachProposals({ ...base, habits: [kept(monWed.slice(2))], applied: [cutHabit] })).toEqual([]); // 6/8
    expect(coachProposals({ ...base, habits: [kept(monWed)], applied: [cutHabit, { ...cutHabit, decidedDate: "2026-09-20", payload: { habitId: H, from: [1, 2, 3], to: [1, 3] } }] })).toEqual([]);
    expect(coachProposals({ ...base, habits: [kept(monWed)] })).toEqual([]); // never cut
  });

  it("grows a cut rule back one step once sessions hold, carrying habits at the current size", () => {
    const p = rule({ intendedMinutes: 15, sessionMinutes: [15, 20, 25, 20], focusHabits: [{ id: H, targetMinutes: 15, weekdays: [1] }] });
    const [d] = coachProposals({ ...base, protocols: [p], applied: [cutRule] });
    expect(d).toMatchObject({ kind: "rule_minutes", targetKey: `${P}:grow`, title: "'쉐도잉' 15분 → 20분" });
    expect(RuleMinutesPayload.parse(d.payload)).toEqual({ protocolId: P, from: 15, to: 20, habits: [{ id: H, from: 15, to: 20 }] });
    expect(coachProposals({ ...base, protocols: [rule({ intendedMinutes: 15, sessionMinutes: [15, 20, 25] })], applied: [cutRule] })).toEqual([]);
    expect(coachProposals({ ...base, protocols: [rule({ intendedMinutes: 40, sessionMinutes: [40, 40, 40, 40] })], applied: [cutRule] })).toEqual([]);
    const [small] = coachProposals({ ...base, protocols: [rule({ intendedMinutes: 15, sessionMinutes: [15, 15, 16, 15] })], applied: [cutRule] });
    expect((small.payload as { to: number }).to).toBe(20); // at least +5
  });

  it("time slot: the clear hour of the sessions, weekdays from focus habits, not when a block is planned", () => {
    const p = rule({ intendedMinutes: 30, sessionMinutes: [30, 30, 30, 30], sessionHours: [7, 7, 7, 9], focusHabits: [{ id: H, targetMinutes: 30, weekdays: [3, 1] }] });
    const [d] = coachProposals({ ...base, protocols: [p] });
    expect(d).toMatchObject({ kind: "time_slot", targetKey: P, title: "'쉐도잉' 07:00에 30분 블록", evidence: { sessions: 4, inHour: 3, hour: 7 } });
    expect(d.payload).toEqual({ protocolId: P, missionId: M, hour: 7, minutes: 30, weekdays: [1, 3] });
    expect(coachProposals({ ...base, protocols: [{ ...p, hasUpcomingBlock: true }] })).toEqual([]);
    expect(coachProposals({ ...base, protocols: [{ ...p, sessionHours: [7, 7, 9, 9] }] })).toEqual([]);
    expect(coachProposals({ ...base, protocols: [{ ...p, sessionHours: [7, 7, 7, 9, 9, 10, 11] }] })).toEqual([]);
    expect(coachProposals({ ...base, protocols: [p], applied: [{ kind: "time_slot", decidedDate: "2026-09-25", payload: { protocolId: P } }] })).toEqual([]);
  });

  it("order: reductions, then grows, then time slots, then reviews", () => {
    const slot = rule({ intendedMinutes: 30, sessionMinutes: [30, 30, 30, 30], sessionHours: [7, 7, 7, 7] });
    const weak = { id: M, title: "독서", weekdays: [1, 2, 3, 4, 5], createdDate: "2026-08-01", checkedDates: [] };
    const out = coachProposals({
      ...base,
      protocols: [slot],
      habits: [kept(monWed), weak],
      applied: [cutHabit],
      signals: [{ missionId: M, missionTitle: "영어", layer: "goal", evidence: { paceGap: 0.3 } }],
    });
    expect(out.map((d) => d.kind + (d.targetKey.endsWith(":grow") ? ":grow" : ""))).toEqual(["habit_days", "habit_days:grow", "time_slot"]);
  });
});
