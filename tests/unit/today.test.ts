import { describe, expect, it } from "vitest";
import { dayPlannedMinutes, overflowSelection, overloadFor, todaySections } from "@/features/scheduler/utils/today";
import { dailyCapacity } from "@/features/analytics/utils/capacity";
import type { CalendarBlock } from "@/features/scheduler/domain/schedule.types";
import type { Task } from "@/features/scheduler/domain/task.types";
import type { SessionWithTask } from "@/features/scheduler/domain/work-session.types";

const L = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00-04:00`).toISOString();
const DAY = "2026-10-28";
const todayRange = { start: L(DAY, "00:00"), end: L("2026-10-29", "00:00") };
const now = new Date(L(DAY, "12:00"));
const task = (id: string, over: Partial<Task> = {}) =>
  ({ id, title: id, status: "planned", priority: 3, tags: [], ...over }) as unknown as Task;
const block = (id: string, taskId: string, start: string, end: string, status = "planned", t = task(taskId)) =>
  ({ id, task_id: taskId, starts_at: start, ends_at: end, status, task: t }) as unknown as CalendarBlock;
const sess = (taskId: string, start: string, end: string | null, blockId: string | null = null) =>
  ({ id: `s-${taskId}`, task_id: taskId, schedule_block_id: blockId, started_at: start, ended_at: end, pauses: [], work_log: null, task: { id: taskId, title: taskId } }) as unknown as SessionWithTask;
const base = { tasks: [] as Task[], blocks: [] as CalendarBlock[], sessions: [] as SessionWithTask[], activeSession: null, now, todayRange, tagFilter: [] as string[] };

describe("todaySections", () => {
  it("current / next / later / missed from today's blocks", () => {
    const blocks = [
      block("m", "tm", L(DAY, "08:00"), L(DAY, "09:00")), // ended, no session → missed
      block("c", "tc", L(DAY, "11:30"), L(DAY, "12:30")), // covers now
      block("n", "tn", L(DAY, "14:00"), L(DAY, "15:00")),
      block("l", "tl", L(DAY, "16:00"), L(DAY, "17:00")),
    ];
    const s = todaySections({ ...base, blocks, tasks: blocks.map((b) => b.task) });
    expect(s.missed.map((b) => b.id)).toEqual(["m"]);
    expect(s.current.map((b) => b.id)).toEqual(["c"]);
    expect(s.next?.id).toBe("n");
    expect(s.later.map((b) => b.id)).toEqual(["l"]);
    expect(s.unscheduled).toEqual([]);
  });
  it("running task shows once; its block isn't listed as current", () => {
    const t = task("run", { status: "in_progress" });
    const b = block("rb", "run", L(DAY, "11:30"), L(DAY, "12:30"), "planned", t);
    const active = sess("run", L(DAY, "11:35"), null, "rb");
    const s = todaySections({ ...base, tasks: [t], blocks: [b], sessions: [active], activeSession: active });
    expect(s.running?.task_id).toBe("run");
    expect(s.current).toEqual([]);
    expect(s.unscheduled).toEqual([]);
  });
  it("unscheduled = open tasks without an upcoming block; other-day-only tasks are excluded", () => {
    const tomorrowOnly = task("tmr");
    const loose = task("loose", { status: "inbox" });
    const blocks = [block("t1", "tmr", L("2026-10-29", "10:00"), L("2026-10-29", "11:00"), "planned", tomorrowOnly)];
    const s = todaySections({ ...base, tasks: [tomorrowOnly, loose], blocks });
    expect(s.unscheduled.map((t) => t.id)).toEqual(["loose"]);
    expect([s.next, ...s.later, ...s.current]).toEqual([null]);
  });
  it("completed today and tag filter", () => {
    const tag = { id: "g", name: "x", color: null };
    const a = task("a", { status: "inbox", tags: [tag] });
    const b = task("b", { status: "inbox" });
    const c = task("c", { status: "completed", tags: [tag] });
    const s = todaySections({ ...base, tasks: [a, b, c], tagFilter: ["g"] });
    expect(s.unscheduled.map((t) => t.id)).toEqual(["a"]);
    expect(s.completed.map((t) => t.id)).toEqual(["c"]);
  });
});

describe("overload", () => {
  it("planned minutes exclude skipped and cancelled; clip to the day", () => {
    const blocks = [
      { starts_at: L(DAY, "09:00"), ends_at: L(DAY, "10:00"), status: "planned" },
      { starts_at: L(DAY, "10:00"), ends_at: L(DAY, "11:00"), status: "skipped" },
      { starts_at: L(DAY, "11:00"), ends_at: L(DAY, "12:00"), status: "cancelled" },
      { starts_at: L(DAY, "23:30"), ends_at: L("2026-10-29", "00:30"), status: "missed" },
    ];
    expect(dayPlannedMinutes(blocks, todayRange)).toBe(90);
  });
  it("> 1.3× capacity and ≥ 60 min above", () => {
    expect(overloadFor(300, 200)).toBe(true); // 1.5×, +100
    expect(overloadFor(260, 200)).toBe(false); // exactly 1.3×
    expect(overloadFor(150, 100)).toBe(false); // 1.5× but only +50
    expect(overloadFor(500, null)).toBe(false);
  });
  it("overflowSelection: low priority (high number) first, then latest start, until within capacity", () => {
    const c = [
      { id: "a", minutes: 60, priority: 1, starts_at: L(DAY, "09:00") },
      { id: "b", minutes: 60, priority: 5, starts_at: L(DAY, "10:00") },
      { id: "c", minutes: 60, priority: 3, starts_at: L(DAY, "15:00") },
      { id: "d", minutes: 60, priority: 3, starts_at: L(DAY, "13:00") },
    ];
    expect(overflowSelection(c, 240, 120)).toEqual(["b", "c"]);
    const ones = c.map((x) => ({ ...x, priority: 1 }));
    expect(overflowSelection(ones, 240, 180)).toEqual(["c"]); // latest start first
  });
});

describe("dailyCapacity", () => {
  it("median of meaningful work days in the last 28 days (today excluded)", () => {
    const s = (d: string, mins: number) => ({ started_at: L(d, "09:00"), ended_at: new Date(new Date(L(d, "09:00")).getTime() + mins * 60_000).toISOString(), pauses: [] });
    const sessions = [s("2026-10-26", 60), s("2026-10-27", 180), s("2026-10-23", 10), s(DAY, 300)];
    const cap = dailyCapacity({ sessions, plannedWorkDays: [1, 2, 3, 4, 5], minMeaningfulMinutes: 30, timezone: "America/Toronto", now: now.toISOString() });
    expect(cap).toBe(120);
  });
});
