import { describe, expect, it } from "vitest";
import { computeDaySummary, formatElapsed } from "@/features/scheduler/utils/metrics";

// Toronto 2026-09-29 = [04:00Z, next day 04:00Z)
const range = { start: "2026-09-29T04:00:00.000Z", end: "2026-09-30T04:00:00.000Z" };
const blk = (s: string, e: string, status = "planned") => ({ starts_at: s, ends_at: e, status });
const ses = (
  s: string,
  e: string | null,
  focus: number | null = null,
  pauses: { paused_at: string; resumed_at: string | null }[] = [],
) => ({
  started_at: s,
  ended_at: e,
  pauses,
  work_log: focus === null ? null : { focus_score: focus },
});

describe("computeDaySummary", () => {
  it("planned includes skipped, excludes cancelled (spec §59)", () => {
    const r = computeDaySummary({
      blocks: [
        blk("2026-09-29T14:00:00Z", "2026-09-29T15:00:00Z"),
        blk("2026-09-29T16:00:00Z", "2026-09-29T16:30:00Z", "skipped"),
        blk("2026-09-29T17:00:00Z", "2026-09-29T18:00:00Z", "cancelled"),
      ],
      sessions: [],
      range,
    });
    expect(r.plannedMinutes).toBe(90);
    expect(r.skippedMinutes).toBe(30);
  });

  it("actual counts finished sessions only; running is separate (spec §60)", () => {
    const r = computeDaySummary({
      blocks: [],
      sessions: [
        ses("2026-09-29T17:08:00Z", "2026-09-29T18:37:00Z", 4),
        ses("2026-09-29T20:00:00Z", null),
      ],
      range,
      now: new Date("2026-09-29T20:15:00Z"),
    });
    expect(r.actualMinutes).toBe(89);
    expect(r.runningMinutes).toBe(15);
    expect(r.averageFocus).toBe(4);
  });

  it("splits a session crossing local midnight", () => {
    const r = computeDaySummary({
      blocks: [],
      sessions: [ses("2026-09-30T03:30:00Z", "2026-09-30T04:30:00Z", 3)],
      range,
    });
    expect(r.actualMinutes).toBe(30);
    expect(r.averageFocus).toBe(3);
  });

  it("returns null focus when nothing was rated", () => {
    expect(computeDaySummary({ blocks: [], sessions: [], range }).averageFocus).toBeNull();
  });
});

describe("formatElapsed", () => {
  it("formats H:MM:SS", () => {
    expect(formatElapsed(0)).toBe("0:00:00");
    expect(formatElapsed(89 * 60_000 + 5_000)).toBe("1:29:05");
  });
});

describe("computeDaySummary v2 (pauses)", () => {
  it("actual subtracts pauses; a pause crossing midnight only counts inside the day", () => {
    const r = computeDaySummary({
      blocks: [],
      sessions: [
        // 03:00–05:00Z = 23:00–01:00 Toronto; pause 03:50–04:20Z crosses local midnight (04:00Z)
        ses("2026-09-29T03:00:00Z", "2026-09-29T05:00:00Z", null, [
          { paused_at: "2026-09-29T03:50:00Z", resumed_at: "2026-09-29T04:20:00Z" },
        ]),
      ],
      range,
    });
    // inside [04:00Z, …): 04:00–05:00 = 60 min, minus 04:00–04:20 = 20 → 40
    expect(r.actualMinutes).toBe(40);
  });

  it("running minutes exclude an open pause", () => {
    const r = computeDaySummary({
      blocks: [],
      sessions: [ses("2026-09-29T20:00:00Z", null, null, [{ paused_at: "2026-09-29T20:10:00Z", resumed_at: null }])],
      range,
      now: new Date("2026-09-29T20:30:00Z"),
    });
    expect(r.runningMinutes).toBe(10);
  });
});
