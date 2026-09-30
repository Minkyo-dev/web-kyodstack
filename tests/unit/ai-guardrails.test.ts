import { describe, expect, it } from "vitest";
import { remainingCapacityMinutes } from "@/features/ai/utils/capacity";
import { sanitizeRecommendations } from "@/features/ai/utils/sanitize";
import { RecommendationListSchema } from "@/features/ai/schemas/recommendation.schema";
import { WeeklyReviewOutputSchema } from "@/features/ai/schemas/weekly-review.schema";

const TO = "America/Toronto";

describe("remainingCapacityMinutes (spec §63)", () => {
  const day = { today: "2026-09-29", timezone: TO, workdayStart: "08:00:00", workdayEnd: "22:00:00" };
  it("counts from now to workday end minus merged planned blocks", () => {
    const minutes = remainingCapacityMinutes({
      ...day,
      now: new Date("2026-09-29T20:00:00Z"), // 16:00 local → 6h window
      blocks: [
        { starts_at: "2026-09-29T21:00:00Z", ends_at: "2026-09-29T23:00:00Z", status: "planned" }, // 17-19
        { starts_at: "2026-09-29T22:00:00Z", ends_at: "2026-09-30T00:30:00Z", status: "planned" }, // 18-20:30 overlaps
        { starts_at: "2026-09-29T19:00:00Z", ends_at: "2026-09-29T21:00:00Z", status: "planned" }, // 15-17 → only 16-17 counts
        { starts_at: "2026-09-30T00:30:00Z", ends_at: "2026-09-30T01:00:00Z", status: "skipped" }, // ignored
      ],
    });
    expect(minutes).toBe(360 - 270); // busy 16:00–20:30
  });
  it("is 0 after the workday ends", () => {
    expect(remainingCapacityMinutes({ ...day, now: new Date("2026-09-30T03:00:00Z"), blocks: [] })).toBe(0);
  });
  it("starts at the workday start when it's early", () => {
    expect(remainingCapacityMinutes({ ...day, now: new Date("2026-09-29T08:00:00Z"), blocks: [] })).toBe(14 * 60);
  });
});

describe("sanitizeRecommendations (spec §31, §64)", () => {
  const allowed = new Map([["p1", new Set(["m1"])]]);
  const rec = (over: Partial<Parameters<typeof sanitizeRecommendations>[0][number]>) => ({
    title: "t",
    description: null,
    estimatedMinutes: 60,
    priority: 2,
    rationale: "r",
    projectId: "p1",
    milestoneId: "m1",
    ...over,
  });

  it("drops invented projects, clears foreign milestones, dedupes, respects capacity", () => {
    const out = sanitizeRecommendations(
      [
        rec({ title: "A", estimatedMinutes: 58 }), // → 60
        rec({ title: "B", projectId: "invented" }),
        rec({ title: "C", milestoneId: "m-other" }),
        rec({ title: "Existing task" }),
        rec({ title: "D", estimatedMinutes: 120 }), // would exceed 150
        rec({ title: "E", estimatedMinutes: 30 }),
      ],
      { allowed, capacityMinutes: 150, existingTitles: ["existing TASK"] },
    );
    expect(out.map((o) => [o.title, o.estimatedMinutes, o.milestoneId, o.recommendationType])).toEqual([
      ["A", 60, "m1", "milestone_task"],
      ["C", 60, null, "daily_task"],
      ["E", 30, "m1", "milestone_task"],
    ]);
  });
});

describe("output schemas reject malformed model JSON (spec §31)", () => {
  it("recommendations", () => {
    expect(RecommendationListSchema.safeParse({ recommendations: [{ title: "" }] }).success).toBe(false);
    expect(
      RecommendationListSchema.safeParse({
        recommendations: Array.from({ length: 6 }, () => ({
          title: "x", description: null, estimatedMinutes: 30, priority: 1, rationale: "", projectId: "p", milestoneId: null,
        })),
      }).success,
    ).toBe(false);
  });
  it("weekly review", () => {
    expect(WeeklyReviewOutputSchema.safeParse({ summary: "ok", positives: [], issues: [], recommendations: [] }).success).toBe(true);
    expect(WeeklyReviewOutputSchema.safeParse({ summary: "ok" }).success).toBe(false);
  });
});
