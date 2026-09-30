import { describe, expect, it } from "vitest";
import { computeWeeklyMetrics, type WeekInput } from "@/features/scheduler/utils/weekly-metrics";

// Toronto week Mon 2026-09-28 .. Sun 2026-10-04 (EDT, UTC-4)
const base: WeekInput = {
  range: { start: "2026-09-28T04:00:00.000Z", end: "2026-10-05T04:00:00.000Z" },
  timezone: "America/Toronto",
  weekStart: "2026-09-28",
  blocks: [],
  sessions: [],
  reflections: [],
  completedTasks: [],
  createdTaskCount: 0,
  revisions: [],
};
const ses = (start: string, end: string | null, focus: number | null, type: string | null = null) => ({
  started_at: start,
  ended_at: end,
  focus_score: focus,
  mood_score: null,
  energy_score: null,
  templateName: type,
});

describe("computeWeeklyMetrics", () => {
  it("planned/skipped/actual and ratio (spec §59, §60)", () => {
    const m = computeWeeklyMetrics({
      ...base,
      blocks: [
        { starts_at: "2026-09-29T14:00:00Z", ends_at: "2026-09-29T16:00:00Z", status: "planned" },
        { starts_at: "2026-09-30T14:00:00Z", ends_at: "2026-09-30T15:00:00Z", status: "skipped" },
        { starts_at: "2026-10-01T14:00:00Z", ends_at: "2026-10-01T15:00:00Z", status: "cancelled" },
      ],
      sessions: [
        ses("2026-09-29T14:00:00Z", "2026-09-29T15:30:00Z", 4, "Technical Blog"),
        ses("2026-09-29T20:00:00Z", null, 5), // running: excluded
      ],
    });
    expect(m).toMatchObject({
      plannedMinutes: 180,
      skippedMinutes: 60,
      skippedBlockCount: 1,
      actualMinutes: 90,
      planCompletionRatio: 0.5,
      deepWorkMinutes: 90,
      averageFocus: 4,
    });
    expect(m.dailyActualMinutes).toEqual([{ date: "2026-09-29", minutes: 90 }]);
    expect(m.topTaskTypes).toEqual([{ name: "Technical Blog", actualMinutes: 90 }]);
  });

  it("groups by local day, not UTC (spec §58)", () => {
    // 2026-09-30 02:30Z is still 2026-09-29 in Toronto
    const m = computeWeeklyMetrics({ ...base, sessions: [ses("2026-09-30T02:30:00Z", "2026-09-30T03:00:00Z", null)] });
    expect(m.dailyActualMinutes).toEqual([{ date: "2026-09-29", minutes: 30 }]);
  });

  it("finds best and worst 3-hour focus windows in local time", () => {
    const m = computeWeeklyMetrics({
      ...base,
      sessions: [
        ses("2026-09-29T13:00:00Z", "2026-09-29T15:00:00Z", 5), // 09:00 local
        ses("2026-09-29T23:00:00Z", "2026-09-30T00:30:00Z", 2), // 19:00 local
        ses("2026-09-30T13:30:00Z", "2026-09-30T14:00:00Z", 1), // 09:30, 30 min → window 09-12 stays qualified
      ],
    });
    expect(m.bestFocusWindow).toMatchObject({ start: "09:00", end: "12:00" });
    expect(m.worstFocusWindow).toMatchObject({ start: "18:00", end: "21:00", averageFocus: 2 });
  });

  it("flags under/overestimated task types by summed actual/base", () => {
    const m = computeWeeklyMetrics({
      ...base,
      completedTasks: [
        { templateName: "Writing", baseMinutes: 60, actualMinutes: 90 },
        { templateName: "Writing", baseMinutes: 60, actualMinutes: 80 },
        { templateName: "Email", baseMinutes: 60, actualMinutes: 30 },
        { templateName: "Coding", baseMinutes: 60, actualMinutes: 60 },
        { templateName: null, baseMinutes: 60, actualMinutes: 999 },
      ],
    });
    expect(m.completedTaskCount).toBe(5);
    expect(m.underestimatedTaskTypes).toEqual([{ name: "Writing", ratio: 1.42, samples: 2 }]);
    expect(m.overestimatedTaskTypes).toEqual([{ name: "Email", ratio: 0.5, samples: 1 }]);
  });

  it("reschedule analysis (spec §37)", () => {
    const m = computeWeeklyMetrics({
      ...base,
      revisions: [
        { change_type: "created", previous_starts_at: null, new_starts_at: "2026-09-29T14:00:00Z" },
        { change_type: "moved", previous_starts_at: "2026-09-29T23:00:00Z", new_starts_at: "2026-09-30T13:00:00Z" },
        { change_type: "resized", previous_starts_at: "2026-09-29T14:00:00Z", new_starts_at: "2026-09-29T14:00:00Z" },
      ],
    });
    expect(m).toMatchObject({ rescheduleCount: 2, moveCount: 1, resizeCount: 1, minutesShifted: 840, daysShifted: 1 });
  });

  it("returns nulls rather than fake numbers for an empty week", () => {
    const m = computeWeeklyMetrics(base);
    expect(m.planCompletionRatio).toBeNull();
    expect(m.averageFocus).toBeNull();
    expect(m.bestFocusWindow).toBeNull();
  });
});
