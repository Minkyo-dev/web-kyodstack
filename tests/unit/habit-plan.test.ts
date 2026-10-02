import { describe, expect, it } from "vitest";
import { composeRule, RULE_LIMITS } from "@/features/direction/domain/rule-sentence";
import { planDone, planSteps } from "@/features/direction/domain/plan";
import { createChangePlanSchema } from "@/features/direction/schemas/direction.schema";

describe("composeRule", () => {
  it("joins when, where and what into one sentence", () => {
    expect(composeRule({ cue: "출근 후 커피를 내리면", place: "책상", action: "25분 쉐도잉" })).toBe("출근 후 커피를 내리면, 책상에서 25분 쉐도잉");
  });
  it("place is optional and a trailing comma or 에서 is not doubled", () => {
    expect(composeRule({ cue: "점심 먹고,", place: "", action: "10분 산책" })).toBe("점심 먹고, 10분 산책");
    expect(composeRule({ cue: "퇴근하면", place: "카페에서", action: "글쓰기" })).toBe("퇴근하면, 카페에서 글쓰기");
    expect(composeRule({ cue: " ", place: "", action: "" })).toBe("");
  });
  it("the input caps keep the sentence within the 80-character title", () => {
    const s = composeRule({ cue: "가".repeat(RULE_LIMITS.cue), place: "나".repeat(RULE_LIMITS.place), action: "다".repeat(RULE_LIMITS.action) });
    expect(s.length).toBeLessThanOrEqual(80);
  });
});

describe("planSteps", () => {
  it("marks done steps and the first missing one as next", () => {
    expect(planSteps({ criteria: 0, hasPath: false, rules: 0, habits: 0 })).toEqual({ change: "done", criteria: "next", path: "empty", rules: "empty", habits: "empty" });
    expect(planSteps({ criteria: 2, hasPath: true, rules: 0, habits: 0 })).toMatchObject({ criteria: "done", path: "done", rules: "next", habits: "empty" });
    expect(planDone({ criteria: 1, hasPath: true, rules: 1, habits: 1 })).toBe(5);
  });
  it("a later step can be done while an earlier one is missing", () => {
    expect(planSteps({ criteria: 0, hasPath: true, rules: 1, habits: 0 })).toMatchObject({ criteria: "next", path: "done", habits: "empty" });
  });
});

describe("createChangePlanSchema", () => {
  const change = { title: "영어로 회의하는 사람", identityIds: [] };
  const path = { title: "출력 먼저", approach: "매일 말하기", tradeOffs: null };
  const rule = { title: "출근 후, 책상에서 쉐도잉", steps: [], intendedMinutes: 25 };
  it("only the change is required", () => {
    expect(createChangePlanSchema.safeParse({ change }).success).toBe(true);
  });
  it("a rule needs a process and a habit needs a rule", () => {
    expect(createChangePlanSchema.safeParse({ change, rule }).success).toBe(false);
    expect(createChangePlanSchema.safeParse({ change, path, habit: { title: "쉐도잉", rule: "check", targetMinutes: null, weekdays: [1] } }).success).toBe(false);
    expect(createChangePlanSchema.safeParse({ change, path, rule, habit: { title: "쉐도잉", rule: "check", targetMinutes: null, weekdays: [1] } }).success).toBe(true);
  });
  it("a focus habit needs minutes; criteria need a target when numeric", () => {
    expect(createChangePlanSchema.safeParse({ change, path, rule, habit: { title: "쉐도잉", rule: "focus", targetMinutes: null, weekdays: [1] } }).success).toBe(false);
    expect(createChangePlanSchema.safeParse({ change, criteria: [{ label: "회의 3번", kind: "numeric", targetValue: null, unit: null }] }).success).toBe(false);
  });
});
