import { describe, expect, it } from "vitest";
import { questPool, validatePicks } from "@/features/gamification/utils/quest-pool";
import { dailyQuest } from "@/features/gamification/utils/quest-rules";

const id = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const ctx = {
  date: "2026-09-30", capacity: 180, plannedMinutes: 240, plannedTaskIds: [id(1), id(2)], topDomainId: id(9),
  topTask: { id: id(1), title: "Snowflake RBAC 정리" }, weakDomainId: id(8), taskTitles: ["Snowflake RBAC 정리"],
  stats: { calibration: 70, reliability: 60, consistency: null, recovery: null },
};

describe("questPool", () => {
  it("adds top task and weak domain candidates with keys", () => {
    const pool = questPool(ctx);
    expect(pool.map((c) => c.key)).toEqual(["c1", "c2", "c3", "c4", "c5", "c6", "c7"]);
    expect(pool.find((c) => c.family === "top_task")?.draft).toEqual({ metric: "complete_planned_tasks", params: { taskIds: [id(1)] }, target: 1 });
    expect(pool.find((c) => c.family === "weak_domain")?.draft).toEqual({ metric: "domain_minutes", params: { domainId: id(8) }, target: 30 });
  });
  it("drops the weak domain when it equals the top domain, and the top task without one", () => {
    const pool = questPool({ ...ctx, weakDomainId: id(9), topTask: null });
    expect(pool.some((c) => c.family === "weak_domain" || c.family === "top_task")).toBe(false);
  });
});

describe("validatePicks", () => {
  const pool = questPool(ctx);
  const key = (family: string) => pool.find((c) => c.family === family)!.key;
  it("accepts three compatible picks; the rest become spare", () => {
    const r = validatePicks(pool, { picks: [key("focus"), key("top_task"), key("weak_domain")], title: "핵심 하나", reason: "가장 중요한 일부터" }, 180);
    expect(r?.objectives.map((o) => o.metric)).toEqual(["focus_minutes", "complete_planned_tasks", "domain_minutes"]);
    expect(r?.spare.length).toBe(pool.length - 3);
    expect(r?.title).toBe("핵심 하나");
  });
  it("rejects unknown keys, repeats, duplicate metrics, the conflict pair and over-capacity focus", () => {
    expect(validatePicks(pool, { picks: ["c1", "c2", "zz"], title: "t", reason: "r" }, 180)).toBeNull();
    expect(validatePicks(pool, { picks: ["c1", "c1", "c2"], title: "t", reason: "r" }, 180)).toBeNull();
    expect(validatePicks(pool, { picks: [key("planned"), key("top_task"), key("focus")], title: "t", reason: "r" }, 180)).toBeNull();
    expect(validatePicks(pool, { picks: [key("top_domain"), key("weak_domain"), key("focus")], title: "t", reason: "r" }, 180)).toBeNull(); // same metric
    expect(validatePicks(pool, { picks: [key("focus"), key("early"), key("kept")], title: "t", reason: "r" }, 60)).toBeNull(); // focus 110 > 60
  });
  it("sanitizes title and reason", () => {
    const r = validatePicks(pool, { picks: [key("focus"), key("early"), key("kept")], title: "x".repeat(30), reason: "a\u0000b" }, 180);
    expect(r?.title).toBe("모멘텀 쌓기");
    expect(r?.reason).toBe("ab");
  });
  it("the rule quest stays the fallback", () => {
    expect(dailyQuest(ctx).objectives.length).toBe(3);
  });
});
