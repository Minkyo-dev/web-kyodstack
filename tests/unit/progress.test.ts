import { describe, expect, it } from "vitest";
import { computeProgress, daysUntil, dueState } from "@/features/projects/utils/progress";

describe("computeProgress", () => {
  it("counts by task, excludes cancelled, and sums remaining estimate net of time spent", () => {
    const p = computeProgress([
      { status: "completed", estimateMinutes: 60, actualMinutes: 80 },
      { status: "in_progress", estimateMinutes: 90, actualMinutes: 30 },
      { status: "planned", estimateMinutes: 60, actualMinutes: 0 },
      { status: "in_progress", estimateMinutes: 30, actualMinutes: 50 }, // over → 0 remaining
      { status: "cancelled", estimateMinutes: 999, actualMinutes: 999 },
    ]);
    expect(p).toEqual({
      total: 4,
      completed: 1,
      open: 3,
      ratio: 0.25,
      actualMinutes: 160,
      remainingMinutes: 120,
    });
  });
  it("handles an empty project", () => {
    expect(computeProgress([]).ratio).toBe(0);
  });
});

describe("due helpers", () => {
  it("daysUntil across month and year", () => {
    expect(daysUntil("2026-09-29", "2026-10-02")).toBe(3);
    expect(daysUntil("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysUntil("2026-09-29", "2026-09-28")).toBe(-1);
  });
  it("dueState", () => {
    expect(dueState("2026-09-29", "2026-09-28", false)).toBe("overdue");
    expect(dueState("2026-09-29", "2026-10-01", false)).toBe("due_soon");
    expect(dueState("2026-09-29", "2026-10-20", false)).toBe("on_track");
    expect(dueState("2026-09-29", "2026-09-01", true)).toBe("done");
    expect(dueState("2026-09-29", null, false)).toBe("none");
  });
});
