import { describe, expect, it } from "vitest";
import { acceptableLine, buildBrief, phaseFor, pickOneThing, toBriefTasks, type BriefInput, type BriefTask } from "@/features/assistant/domain/brief";
import { BriefLineOutputSchema } from "@/features/ai/schemas/brief-line.schema";
import { upsertReflectionSchema } from "@/features/scheduler/schemas/reflection.schema";

const TODAY = "2026-10-02";
const task = (over: Partial<BriefTask>): BriefTask => ({
  id: "t",
  title: "t",
  status: "planned",
  priority: 3,
  dueDate: null,
  changeTitle: null,
  firstBlockAt: null,
  ...over,
});
const base: BriefInput = {
  today: TODAY,
  hour: 8,
  eveningHour: 18,
  tasks: [],
  habits: { due: 0, done: 0, missedYesterday: [] },
  capacity: { plannedMinutes: 0, capacityMinutes: null },
  nextStep: null,
  yesterday: null,
  checkIn: { done: false, nextTaskTitle: null },
  line: null,
};

describe("phaseFor", () => {
  it("morning before noon, day until the evening hour, evening after", () => {
    expect([phaseFor(0, 18), phaseFor(11, 18), phaseFor(12, 18), phaseFor(17, 18), phaseFor(18, 18), phaseFor(21, 20)]).toEqual([
      "morning", "morning", "day", "day", "evening", "evening",
    ]);
  });
});

describe("pickOneThing", () => {
  const chosen = task({ id: "chosen", title: "A" });
  const change = task({ id: "change", title: "B", changeTitle: "영어", firstBlockAt: "2026-10-02T15:00:00Z" });
  const early = task({ id: "early", title: "C", firstBlockAt: "2026-10-02T13:00:00Z" });
  const due = task({ id: "due", title: "D", dueDate: "2026-10-01", priority: 4 });
  const top = task({ id: "top", title: "E", priority: 1 });
  const all = [chosen, change, early, due, top];
  it("applies the rules in order", () => {
    expect(pickOneThing(all, TODAY, "chosen")).toMatchObject({ taskId: "chosen", reason: "chosen", reasonText: "어제 정한 일" });
    expect(pickOneThing(all, TODAY, null)).toMatchObject({ taskId: "change", reason: "change", reasonText: "변화 '영어'로 가는 일" });
    expect(pickOneThing([chosen, early, due, top], TODAY, null)).toMatchObject({ taskId: "early", reason: "earliest" });
    expect(pickOneThing([chosen, due, top], TODAY, null)).toMatchObject({ taskId: "due", reason: "due" });
    expect(pickOneThing([chosen, top], TODAY, null)).toMatchObject({ taskId: "top", reason: "priority" });
  });
  it("skips a chosen task that is no longer open and ignores done tasks", () => {
    const doneChosen = task({ id: "chosen", status: "completed" });
    expect(pickOneThing([doneChosen, top], TODAY, "chosen")?.taskId).toBe("top");
    expect(pickOneThing([task({ status: "completed" })], TODAY, null)).toBeNull();
  });
  it("priority 1 is the most important (scheduler convention)", () => {
    expect(pickOneThing([task({ id: "low", priority: 5 }), task({ id: "high", priority: 1 })], TODAY, null)?.taskId).toBe("high");
    const dueLow = task({ id: "dueLow", dueDate: TODAY, priority: 5 });
    const dueHigh = task({ id: "dueHigh", dueDate: TODAY, priority: 2 });
    expect(pickOneThing([dueLow, dueHigh], TODAY, null)?.taskId).toBe("dueHigh");
  });
  it("a future due date is not 'due'", () => {
    expect(pickOneThing([task({ id: "later", dueDate: "2026-10-05", priority: 1 })], TODAY, null)?.reason).toBe("priority");
  });
});

describe("buildBrief", () => {
  it("hides empty rows", () => {
    const b = buildBrief(base);
    expect(b).toMatchObject({ phase: "morning", title: "아침 브리핑", oneThing: null, habits: null, overCapacity: null, nextStep: null, yesterday: null });
    expect(b.checkIn.show).toBe(false);
  });
  it("shows missed habits, over-capacity and yesterday's check-in", () => {
    const b = buildBrief({
      ...base,
      habits: { due: 2, done: 1, missedYesterday: ["스트레칭"] },
      capacity: { plannedMinutes: 300, capacityMinutes: 240 },
      yesterday: { nextTaskId: null, blocker: "energy", win: "메일 보냄" },
    });
    expect(b.habits).toEqual({ due: 2, done: 1, missedYesterday: ["스트레칭"] });
    expect(b.overCapacity).toEqual({ plannedMinutes: 300, capacityMinutes: 240 });
    expect(b.yesterday).toEqual({ blocker: "에너지", win: "메일 보냄" });
    expect(buildBrief({ ...base, capacity: { plannedMinutes: 240, capacityMinutes: 240 } }).overCapacity).toBeNull();
  });
  it("offers the check-in in the evening and keeps showing it once done", () => {
    expect(buildBrief({ ...base, hour: 19 })).toMatchObject({ phase: "evening", title: "저녁 체크인", checkIn: { show: true, done: false } });
    expect(buildBrief({ ...base, hour: 9, checkIn: { done: true, nextTaskTitle: "X" } }).checkIn).toEqual({ show: true, done: true, nextTaskTitle: "X" });
  });
});

describe("toBriefTasks", () => {
  it("uses today's first live block and an active change (own or project's)", () => {
    const range = { start: "2026-10-02T04:00:00Z", end: "2026-10-03T04:00:00Z" };
    const [t] = toBriefTasks(
      [{ id: "a", title: "A", status: "planned", priority: 3, due_at: "2026-10-03T02:00:00Z", target_date: null, mission: null, project: { mission: { title: "영어", status: "active" } } }],
      [
        { task_id: "a", starts_at: "2026-10-02T18:00:00Z", status: "planned" },
        { task_id: "a", starts_at: "2026-10-02T14:00:00Z", status: "missed" },
        { task_id: "a", starts_at: "2026-10-03T14:00:00Z", status: "planned" },
      ],
      range,
      () => "2026-10-02",
    );
    expect(t).toMatchObject({ changeTitle: "영어", firstBlockAt: "2026-10-02T18:00:00Z", dueDate: "2026-10-02" });
  });
  it("a closed change does not count", () => {
    const [t] = toBriefTasks(
      [{ id: "a", title: "A", status: "planned", priority: 3, due_at: null, target_date: "2026-10-02", mission: { title: "x", status: "achieved" }, project: null }],
      [],
      { start: "", end: "" },
      () => "",
    );
    expect(t).toMatchObject({ changeTitle: null, dueDate: "2026-10-02", firstBlockAt: null });
  });
});

describe("coach line", () => {
  it("is one short sentence and judgmental words are dropped", () => {
    expect(BriefLineOutputSchema.safeParse({ line: "오늘의 한 가지부터 시작해 봐요." }).success).toBe(true);
    expect(BriefLineOutputSchema.safeParse({ line: "가".repeat(91) }).success).toBe(false);
    expect(acceptableLine("오늘은 가볍게 시작해 봐요.")).toBe(true);
    expect(acceptableLine("어제는 실패했지만 괜찮아요.")).toBe(false);
  });
});

describe("check-in schema", () => {
  const base = { reflectionDate: TODAY, moodScore: null, focusScore: null, energyScore: null, note: null };
  it("accepts the new fields and keeps old payloads valid", () => {
    expect(upsertReflectionSchema.parse(base)).toMatchObject({ win: null, blocker: null, nextTaskId: null });
    expect(upsertReflectionSchema.safeParse({ ...base, win: "  shipped ", blocker: "time", nextTaskId: "0b7c8a3e-5f1d-4c2a-9e6b-1d2f3a4b5c6d" }).success).toBe(true);
    expect(upsertReflectionSchema.safeParse({ ...base, blocker: "lazy" }).success).toBe(false);
    expect(upsertReflectionSchema.safeParse({ ...base, win: "x".repeat(281) }).success).toBe(false);
  });
});
