import { describe, expect, it } from "vitest";
import {
  dailyQuest, evaluateQuest, nextSwap, objectiveValue, recoveryDue, recoveryQuest, weeklyQuest,
} from "@/features/gamification/utils/quest-rules";
import type { QuestFacts } from "@/features/gamification/domain/quest.types";

const id = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const TZ = "America/Toronto";

describe("dailyQuest", () => {
  it("builds focus, planned tasks and domain objectives with the rest as spare", () => {
    const q = dailyQuest({ date: "2026-09-30", capacity: 180, plannedMinutes: 240, plannedTaskIds: [id(1), id(2), id(3)], topDomainId: id(9) });
    expect(q).toMatchObject({ type: "daily", title: "모멘텀 쌓기", periodStart: "2026-09-30", periodEnd: "2026-09-30", rewardXp: 50 });
    expect(q.objectives).toEqual([
      { metric: "focus_minutes", params: {}, target: 110 },
      { metric: "complete_planned_tasks", params: { taskIds: [id(1), id(2), id(3)] }, target: 2 },
      { metric: "domain_minutes", params: { domainId: id(9) }, target: 30 },
    ]);
    expect(q.spare.map((s) => s.metric)).toEqual(["early_session", "kept_commitments"]);
  });

  it("falls back without capacity, plans or domains", () => {
    const q = dailyQuest({ date: "2026-09-30", capacity: null, plannedMinutes: 0, plannedTaskIds: [], topDomainId: null });
    expect(q.objectives).toEqual([
      { metric: "focus_minutes", params: {}, target: 60 },
      { metric: "complete_tasks", params: {}, target: 1 },
      { metric: "kept_commitments", params: {}, target: 1 },
    ]);
    expect(q.spare.map((s) => s.metric)).toEqual(["early_session"]);
  });

  it("never asks for less than 30 focus minutes", () => {
    expect(dailyQuest({ date: "2026-09-30", capacity: 40, plannedMinutes: 20, plannedTaskIds: [id(1)], topDomainId: null }).objectives[0].target).toBe(30);
  });
});

describe("weeklyQuest", () => {
  it("scales focus by capacity and work days", () => {
    const q = weeklyQuest({ weekStart: "2026-09-28", weekEnd: "2026-10-04", capacity: 200, plannedWorkDayCount: 5, topDomainId: id(9) });
    expect(q).toMatchObject({ type: "weekly", title: "모멘텀 유지", periodStart: "2026-09-28", periodEnd: "2026-10-04", rewardXp: 300 });
    expect(q.objectives).toEqual([
      { metric: "focus_minutes", params: {}, target: 600 },
      { metric: "kept_commitment_rate", params: { min: 4 }, target: 75 },
      { metric: "domain_sessions", params: { domainId: id(9) }, target: 3 },
      { metric: "days_within_capacity", params: {}, target: 4 },
    ]);
    expect(q.spare).toEqual([]);
  });

  it("drops the capacity objective when capacity is unknown", () => {
    const q = weeklyQuest({ weekStart: "2026-09-28", weekEnd: "2026-10-04", capacity: null, plannedWorkDayCount: 5, topDomainId: null });
    expect(q.objectives.map((o) => [o.metric, o.target])).toEqual([
      ["focus_minutes", 300],
      ["kept_commitment_rate", 75],
      ["complete_tasks", 5],
    ]);
  });
});

describe("recovery", () => {
  it("is due after two quiet work days with earlier activity and no recent recovery", () => {
    const base = { today: "2026-09-30", minMeaningful: 30, lastTwoWorkDays: [{ date: "2026-09-29", focused: 0 }, { date: "2026-09-28", focused: 10 }], hadEarlierActivity: true, lastRecoveryStart: null };
    expect(recoveryDue(base)).toBe(true);
    expect(recoveryDue({ ...base, lastTwoWorkDays: [{ date: "2026-09-29", focused: 45 }, { date: "2026-09-28", focused: 0 }] })).toBe(false);
    expect(recoveryDue({ ...base, hadEarlierActivity: false })).toBe(false);
    expect(recoveryDue({ ...base, lastRecoveryStart: "2026-09-25" })).toBe(false);
    expect(recoveryDue({ ...base, lastRecoveryStart: "2026-09-23" })).toBe(true);
    expect(recoveryDue({ ...base, lastTwoWorkDays: [{ date: "2026-09-29", focused: 0 }] })).toBe(false);
  });
  it("books a block and starts a session; ends tomorrow", () => {
    const q = recoveryQuest("2026-09-30", "2026-10-01");
    expect(q).toMatchObject({ type: "recovery", title: "다시 시작", periodStart: "2026-09-30", periodEnd: "2026-10-01", rewardXp: 40 });
    expect(q.objectives).toEqual([
      { metric: "booked_block", params: { minMinutes: 30 }, target: 1 },
      { metric: "started_session", params: {}, target: 1 },
    ]);
  });
});

describe("nextSwap", () => {
  const spare = [
    { metric: "early_session" as const, params: { before: "12:00" }, target: 1 },
    { metric: "kept_commitments" as const, params: {}, target: 1 },
  ];
  it("takes the first spare whose metric is not already used", () => {
    const r = nextSwap([{ metric: "focus_minutes", completed: false }, { metric: "early_session", completed: false }], spare);
    expect(r).toEqual({ replacement: spare[1], spare: [spare[0]] });
  });
  it("returns null when nothing fits", () => {
    expect(nextSwap([{ metric: "early_session", completed: false }, { metric: "kept_commitments", completed: false }], spare)).toBeNull();
    expect(nextSwap([], [])).toBeNull();
  });
});

const facts = (over: Partial<QuestFacts> = {}): QuestFacts => ({
  timezone: TZ,
  now: "2026-09-30T20:00:00Z",
  plannedWorkDays: [1, 2, 3, 4, 5],
  capacity: 120,
  sessions: [],
  tasks: {},
  domainParent: {},
  commitments: [],
  blocks: [],
  ...over,
});
const daily = { periodStart: "2026-09-30", periodEnd: "2026-09-30", createdAt: "2026-09-30T12:00:00Z" };

describe("objectiveValue", () => {
  const s = (n: number, start: string, end: string, task = id(50), source = "timer") => ({ id: id(n), task_id: task, source, started_at: start, ended_at: end, pauses: [] });

  it("focus minutes in the local day, manual included", () => {
    const f = facts({ sessions: [s(1, "2026-09-30T13:00:00Z", "2026-09-30T14:00:00Z"), s(2, "2026-09-30T15:00:00Z", "2026-09-30T15:30:00Z", id(50), "manual"), s(3, "2026-09-29T13:00:00Z", "2026-09-29T14:00:00Z")] });
    expect(objectiveValue({ metric: "focus_minutes", params: {} }, daily, f)).toBe(90);
  });

  it("planned tasks completed, and any tasks completed in the period", () => {
    const f = facts({ tasks: {
      [id(1)]: { status: "completed", completedAt: "2026-09-30T15:00:00Z", domainId: null },
      [id(2)]: { status: "planned", completedAt: null, domainId: null },
      [id(3)]: { status: "completed", completedAt: "2026-09-30T16:00:00Z", domainId: null },
      [id(4)]: { status: "completed", completedAt: "2026-09-29T16:00:00Z", domainId: null },
    } });
    expect(objectiveValue({ metric: "complete_planned_tasks", params: { taskIds: [id(1), id(2)] } }, daily, f)).toBe(1);
    expect(objectiveValue({ metric: "complete_tasks", params: {} }, daily, f)).toBe(2);
  });

  it("domain minutes and sessions include child domains", () => {
    const f = facts({
      domainParent: { [id(9)]: null, [id(8)]: id(9) },
      tasks: { [id(60)]: { status: "planned", completedAt: null, domainId: id(8) }, [id(61)]: { status: "planned", completedAt: null, domainId: null } },
      sessions: [s(1, "2026-09-30T13:00:00Z", "2026-09-30T13:40:00Z", id(60)), s(2, "2026-09-30T14:00:00Z", "2026-09-30T14:05:00Z", id(60)), s(3, "2026-09-30T15:00:00Z", "2026-09-30T16:00:00Z", id(61))],
    });
    expect(objectiveValue({ metric: "domain_minutes", params: { domainId: id(9) } }, daily, f)).toBe(45);
    expect(objectiveValue({ metric: "domain_sessions", params: { domainId: id(9) } }, daily, f)).toBe(1);
  });

  it("kept commitments and the kept rate with a minimum", () => {
    const c = (n: number, kept: boolean, at = "2026-09-30T14:00:00Z") => ({ blockId: id(n), resolvedAt: at, score: kept ? 1 : 0, kept });
    const f3 = facts({ commitments: [c(1, true), c(2, true), c(3, false)] });
    expect(objectiveValue({ metric: "kept_commitments", params: {} }, daily, f3)).toBe(2);
    expect(objectiveValue({ metric: "kept_commitment_rate", params: { min: 4 } }, daily, f3)).toBe(0);
    const f4 = facts({ commitments: [c(1, true), c(2, true), c(3, true), c(4, false)] });
    expect(objectiveValue({ metric: "kept_commitment_rate", params: { min: 4 } }, daily, f4)).toBe(75);
  });

  it("days within capacity counts elapsed planned work days without overload", () => {
    const week = { periodStart: "2026-09-28", periodEnd: "2026-10-04", createdAt: "2026-09-28T12:00:00Z" };
    const b = (day: string, h: number) => ({ id: `${day}-${h}`, created_at: "2026-09-27T00:00:00Z", starts_at: `${day}T13:00:00Z`, ends_at: `${day}T${13 + h}:00:00Z`, status: "planned" });
    // capacity 120: Mon 2h ok, Tue 5h overload, Wed = today (not elapsed)
    const f = facts({ blocks: [b("2026-09-28", 2), b("2026-09-29", 5), b("2026-09-30", 1)] });
    expect(objectiveValue({ metric: "days_within_capacity", params: {} }, week, f)).toBe(1);
    expect(objectiveValue({ metric: "days_within_capacity", params: {} }, week, facts({ capacity: null }))).toBe(0);
  });

  it("early session, booked block and started session", () => {
    // 12:00 Toronto = 16:00Z on 2026-09-30
    const early = facts({ sessions: [s(1, "2026-09-30T15:30:00Z", "2026-09-30T16:30:00Z")] });
    expect(objectiveValue({ metric: "early_session", params: { before: "12:00" } }, daily, early)).toBe(1);
    const late = facts({ sessions: [s(1, "2026-09-30T16:30:00Z", "2026-09-30T17:30:00Z")] });
    expect(objectiveValue({ metric: "early_session", params: { before: "12:00" } }, daily, late)).toBe(0);

    const blocks = [
      { id: "a", created_at: "2026-09-30T11:00:00Z", starts_at: "2026-09-30T18:00:00Z", ends_at: "2026-09-30T19:00:00Z", status: "planned" },
      { id: "b", created_at: "2026-09-30T13:00:00Z", starts_at: "2026-10-01T13:00:00Z", ends_at: "2026-10-01T13:20:00Z", status: "planned" },
    ];
    expect(objectiveValue({ metric: "booked_block", params: { minMinutes: 30 } }, daily, facts({ blocks }))).toBe(0);
    blocks.push({ id: "c", created_at: "2026-09-30T13:00:00Z", starts_at: "2026-10-02T13:00:00Z", ends_at: "2026-10-02T13:30:00Z", status: "planned" });
    expect(objectiveValue({ metric: "booked_block", params: { minMinutes: 30 } }, daily, facts({ blocks }))).toBe(1);

    expect(objectiveValue({ metric: "started_session", params: {} }, daily, facts({ sessions: [s(1, "2026-09-30T11:00:00Z", "2026-09-30T11:30:00Z")] }))).toBe(0);
    expect(objectiveValue({ metric: "started_session", params: {} }, daily, facts({ sessions: [s(1, "2026-09-30T12:30:00Z", "2026-09-30T12:40:00Z")] }))).toBe(1);
  });
});

describe("evaluateQuest", () => {
  const f = facts({ sessions: [{ id: id(1), task_id: id(50), source: "timer", started_at: "2026-09-30T13:00:00Z", ended_at: "2026-09-30T14:00:00Z", pauses: [] }] });
  const obj = (n: number, metric: "focus_minutes" | "started_session", target: number, completedAt: string | null = null) => ({ id: id(n), metric, params: {}, target, completedAt });

  it("updates values, marks completion once and clears when all are complete", () => {
    const r = evaluateQuest(daily, [obj(1, "focus_minutes", 60), obj(2, "started_session", 1)], f);
    expect(r.updates).toEqual([
      { id: id(1), current: 60, completedAt: f.now },
      { id: id(2), current: 1, completedAt: f.now },
    ]);
    expect(r.cleared).toBe(true);
  });

  it("keeps a completion when the value later drops", () => {
    const r = evaluateQuest(daily, [obj(1, "focus_minutes", 90, "2026-09-30T15:00:00Z")], f);
    expect(r.updates[0]).toEqual({ id: id(1), current: 60, completedAt: "2026-09-30T15:00:00Z" });
    expect(r.cleared).toBe(true);
  });

  it("never clears a quest without objectives", () => {
    expect(evaluateQuest(daily, [], f).cleared).toBe(false);
  });
});
