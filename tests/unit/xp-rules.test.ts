import { describe, expect, it } from "vitest";
import { evaluateDay, focusXp } from "@/features/gamification/utils/xp-rules";
import { buildDayFacts } from "@/features/gamification/utils/xp-facts";
import type { DayFacts, XpRaw } from "@/features/gamification/domain/xp.types";

const day = (over: Partial<DayFacts> = {}): DayFacts => ({ date: "2026-09-29", sessions: [], completions: [], commitments: [], habitChecks: [], ...over });
const session = (id: string, m: number, endedAt = "2026-09-29T15:00:00Z", source: "timer" | "manual" = "timer") => ({ id, source, endedAt, focusedMinutes: m });
const id = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;

describe("focusXp", () => {
  it("follows the diminishing curve and the per-session cap", () => {
    expect(focusXp(9.9)).toBe(0);
    expect(focusXp(10)).toBe(5);
    expect(focusXp(30)).toBe(15);
    expect(focusXp(90)).toBe(27);
    expect(focusXp(120)).toBe(28);
    expect(focusXp(150)).toBe(30);
    expect(focusXp(600)).toBe(30);
  });
});

describe("evaluateDay", () => {
  it("awards focus for timer sessions only", () => {
    const ev = evaluateDay(day({ sessions: [session(id(1), 30), session(id(2), 60, undefined, "manual")] }), []);
    expect(ev).toEqual([{ rule: "focus", sourceType: "work_session", sourceId: id(1), localDate: "2026-09-29", xp: 15, metadata: { focusedMinutes: 30 } }]);
  });

  it("caps focus at 120 per day in time order", () => {
    const sessions = [1, 2, 3, 4, 5].map((n) => session(id(n), 150, `2026-09-29T1${n}:00:00Z`));
    const ev = evaluateDay(day({ sessions }), []);
    expect(ev.map((e) => e.xp)).toEqual([30, 30, 30, 30]);
  });

  it("trims the event that crosses the cap", () => {
    const ev = evaluateDay(day({ sessions: [session(id(9), 30)] }), [{ rule: "focus", sourceId: id(1), xp: 110 }]);
    expect(ev.map((e) => e.xp)).toEqual([10]);
  });

  it("is idempotent against its own output", () => {
    const facts = day({
      sessions: [session(id(1), 45)],
      completions: [{ taskId: id(2), completedAt: "2026-09-29T16:00:00Z", focusedMinutes: 45 }],
      commitments: [{ blockId: id(3), resolvedAt: "2026-09-29T14:00:00Z", score: 0.9 }],
    });
    const first = evaluateDay(facts, []);
    expect(first.map((e) => e.rule).sort()).toEqual(["commitment", "completion", "focus"]);
    expect(evaluateDay(facts, first.map((e) => ({ rule: e.rule, sourceId: e.sourceId, xp: e.xp })))).toEqual([]);
  });

  it("keeps the day under the cap after a source disappears", () => {
    // 120 already earned by sessions that were later deleted; a new session earns nothing.
    const existing = [1, 2, 3, 4].map((n) => ({ rule: "focus" as const, sourceId: id(n), xp: 30 }));
    expect(evaluateDay(day({ sessions: [session(id(9), 60)] }), existing)).toEqual([]);
  });

  it("completion needs ≥ 10 focused minutes and stops after 5 per day", () => {
    const completions = [0, 1, 2, 3, 4, 5, 6].map((n) => ({ taskId: id(n), completedAt: `2026-09-29T1${n}:00:00Z`, focusedMinutes: n === 0 ? 9 : 20 }));
    const ev = evaluateDay(day({ completions }), []);
    expect(ev.map((e) => e.sourceId)).toEqual([id(1), id(2), id(3), id(4), id(5)]);
    expect(ev.every((e) => e.xp === 20)).toBe(true);
  });

  it("commitment needs score ≥ 0.75", () => {
    const ev = evaluateDay(day({ commitments: [
      { blockId: id(1), resolvedAt: "2026-09-29T10:00:00Z", score: 0.75 },
      { blockId: id(2), resolvedAt: "2026-09-29T11:00:00Z", score: 0.5 },
    ] }), []);
    expect(ev).toEqual([{ rule: "commitment", sourceType: "schedule_block", sourceId: id(1), localDate: "2026-09-29", xp: 10, metadata: { score: 0.75 } }]);
  });
});

const raw = (over: Partial<XpRaw> = {}): XpRaw => ({
  now: "2026-10-01T12:00:00Z",
  timezone: "America/Toronto",
  settings: { planned_work_days: [1, 2, 3, 4, 5], min_meaningful_minutes: 30, commit_lead_minutes: 120 },
  sessions: [],
  completedTasks: [],
  taskFocus: {},
  blocks: [],
  revisions: [],
  habitChecks: [],
  ...over,
});

describe("buildDayFacts", () => {
  it("groups sessions by local end date and subtracts pauses", () => {
    const facts = buildDayFacts(raw({ sessions: [
      // 23:30–00:30 Toronto on 09-29 → ends 09-30 local
      { id: id(1), task_id: id(9), schedule_block_id: null, source: "timer", started_at: "2026-09-30T03:30:00Z", ended_at: "2026-09-30T04:30:00Z", pauses: [{ paused_at: "2026-09-30T03:40:00Z", resumed_at: "2026-09-30T03:50:00Z" }] },
      { id: id(2), task_id: id(9), schedule_block_id: null, source: "timer", started_at: "2026-09-30T14:00:00Z", ended_at: null, pauses: [] },
    ] }), ["2026-09-29", "2026-09-30"]);
    expect(facts[0].sessions).toEqual([]);
    expect(facts[1].sessions).toEqual([{ id: id(1), source: "timer", endedAt: "2026-09-30T04:30:00Z", focusedMinutes: 50 }]);
  });

  it("uses local calendar days across a DST change", () => {
    // 2026-11-01 is the fall-back day in Toronto (UTC-4 → UTC-5). 23:30 local on 11-01 = 04:30Z on 11-02.
    const facts = buildDayFacts(raw({ sessions: [
      { id: id(1), task_id: id(9), schedule_block_id: null, source: "timer", started_at: "2026-11-02T04:00:00Z", ended_at: "2026-11-02T04:30:00Z", pauses: [] },
    ] }), ["2026-11-01", "2026-11-02"]);
    expect(facts[0].sessions.map((s) => s.id)).toEqual([id(1)]);
    expect(facts[1].sessions).toEqual([]);
  });

  it("completions carry the task's lifetime focus", () => {
    const facts = buildDayFacts(raw({ completedTasks: [{ id: id(3), completed_at: "2026-09-29T16:00:00Z" }], taskFocus: { [id(3)]: 42 } }), ["2026-09-29"]);
    expect(facts[0].completions).toEqual([{ taskId: id(3), completedAt: "2026-09-29T16:00:00Z", focusedMinutes: 42 }]);
  });

  it("keeps only kept final commitments (not skipped/cancelled, not moves)", () => {
    const block = (n: number, status: string) => ({ id: id(n), task_id: id(9), starts_at: "2026-09-29T14:00:00Z", ends_at: "2026-09-29T15:00:00Z", status, created_at: "2026-09-28T12:00:00Z", updated_at: "2026-09-29T10:00:00Z" });
    const facts = buildDayFacts(raw({
      blocks: [block(1, "completed"), block(2, "skipped")],
      sessions: [{ id: id(5), task_id: id(9), schedule_block_id: id(1), source: "timer", started_at: "2026-09-29T14:05:00Z", ended_at: "2026-09-29T14:50:00Z", pauses: [] }],
    }), ["2026-09-29"]);
    expect(facts[0].commitments).toEqual([{ blockId: id(1), resolvedAt: "2026-09-29T14:05:00Z", score: 0.9 }]);
  });
});

describe("habit xp", () => {
  const check = (n: number, at = `2026-09-29T1${n}:00:00Z`) => ({ id: id(100 + n), createdAt: at });
  it("awards 10 per check, 30 per day", () => {
    const ev = evaluateDay(day({ habitChecks: [check(1), check(2), check(3), check(4)] }), []);
    expect(ev.map((e) => [e.rule, e.sourceType, e.xp])).toEqual([
      ["habit", "habit_check", 10],
      ["habit", "habit_check", 10],
      ["habit", "habit_check", 10],
    ]);
  });
  it("counts what the day already holds (re-checks after uncheck cannot exceed the cap)", () => {
    const ev = evaluateDay(day({ habitChecks: [check(5)] }), [{ rule: "habit", sourceId: id(1), xp: 30 }]);
    expect(ev).toEqual([]);
  });
  it("puts habit checks on their local date", () => {
    const facts = buildDayFacts(
      raw({ habitChecks: [{ id: id(7), local_date: "2026-09-30", created_at: "2026-10-01T01:00:00Z" }] }),
      ["2026-09-29", "2026-09-30"],
    );
    expect(facts[0].habitChecks).toEqual([]);
    expect(facts[1].habitChecks).toEqual([{ id: id(7), createdAt: "2026-10-01T01:00:00Z" }]);
  });
});
