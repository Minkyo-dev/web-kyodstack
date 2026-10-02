import { describe, expect, it } from "vitest";
import { objectiveText, toQuestViews } from "@/features/gamification/utils/quest-view";

const o = (metric: string, current: number, target: number, params = {}) => ({ id: metric, position: 1, metric, params, target_value: target, current_value: current, completed_at: current >= target ? "2026-09-30T15:00:00Z" : null });

describe("objectiveText", () => {
  it("renders progress as text", () => {
    const [v] = toQuestViews([{ id: "q", type: "daily", title: "모멘텀 쌓기", status: "active", period_start: "2026-09-30", period_end: "2026-09-30", reward_xp: 50, swap_used: false, spare: [{ metric: "early_session" }], created_at: "", generated_by: "system", reason: null, objectives: [
      o("focus_minutes", 45, 90) as never, o("complete_planned_tasks", 1, 2) as never, o("domain_minutes", 30, 30, { domainId: "d" }) as never,
    ] }], { d: "영어" });
    expect(v.canSwap).toBe(true);
    expect(v.objectives.map((x) => objectiveText(x))).toEqual(["집중 45m / 1h 30m", "계획한 할 일 완료 1/2", "영어 연습 30m / 30m"]);
    expect(v.objectives[2].done).toBe(true);
  });
  it("cannot swap once used or without spare", () => {
    const base = { id: "q", type: "daily" as const, title: "t", status: "active", period_start: "", period_end: "", reward_xp: 50, created_at: "", generated_by: "system", reason: null, objectives: [] };
    expect(toQuestViews([{ ...base, swap_used: true, spare: [{}] }], {})[0].canSwap).toBe(false);
    expect(toQuestViews([{ ...base, swap_used: false, spare: [] }], {})[0].canSwap).toBe(false);
  });
  it("shows the SYSTEM 추천 reason only for AI-picked quests", () => {
    const base = { id: "q", type: "daily" as const, title: "t", status: "active", period_start: "", period_end: "", reward_xp: 50, created_at: "", swap_used: false, spare: [], objectives: [] };
    expect(toQuestViews([{ ...base, generated_by: "ai", reason: "오늘 계획에 맞춘 목표예요" }], {})[0].reason).toBe("오늘 계획에 맞춘 목표예요");
    expect(toQuestViews([{ ...base, generated_by: "system", reason: "x" }], {})[0].reason).toBeNull();
  });
});
