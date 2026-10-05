import { describe, expect, it } from "vitest";
import { dueBuckets, forecast, heatmapWeeks, recallRate, streak } from "@/features/vocab/domain/stats";

describe("dueBuckets / forecast (spec §8.1)", () => {
  const dues = ["2026-10-01", "2026-10-05", "2026-10-05", "2026-10-06", "2026-10-08", "2026-10-12", "2026-10-13"];
  it("counts cumulatively by local date, overdue as today", () => {
    expect(dueBuckets(dues, "2026-10-05")).toEqual({ today: 3, d1: 4, d3: 5, d7: 6 });
  });
  it("lists the next seven days, today first (overdue folded in)", () => {
    expect(forecast(dues, "2026-10-05")).toEqual([
      { date: "2026-10-05", count: 3 },
      { date: "2026-10-06", count: 1 },
      { date: "2026-10-07", count: 0 },
      { date: "2026-10-08", count: 1 },
      { date: "2026-10-09", count: 0 },
      { date: "2026-10-10", count: 0 },
      { date: "2026-10-11", count: 0 },
    ]);
  });
  it("steps by calendar date across the DST change", () => {
    expect(forecast(["2026-11-01", "2026-11-02"], "2026-10-31", 3).map((d) => d.date)).toEqual(["2026-10-31", "2026-11-01", "2026-11-02"]);
  });
});

describe("streak (spec §8.3)", () => {
  const day = (date: string, reviews = 5) => ({ date, reviews });
  it("ends today when today has reviews, otherwise continues from yesterday", () => {
    expect(streak([day("2026-10-03"), day("2026-10-04"), day("2026-10-05")], "2026-10-05")).toEqual({ current: 3, best: 3 });
    expect(streak([day("2026-10-03"), day("2026-10-04")], "2026-10-05")).toEqual({ current: 2, best: 2 });
  });
  it("breaks on a missing day and remembers the best run", () => {
    expect(streak([day("2026-09-20"), day("2026-09-21"), day("2026-09-22"), day("2026-10-04"), day("2026-10-05", 0)], "2026-10-05")).toEqual({ current: 1, best: 3 });
    expect(streak([], "2026-10-05")).toEqual({ current: 0, best: 0 });
  });
});

describe("heatmapWeeks", () => {
  it("lays out whole weeks (Sunday first) ending with today's week, with a level per day", () => {
    const weeks = heatmapWeeks([{ date: "2026-10-05", reviews: 30 }, { date: "2026-10-04", reviews: 2 }], "2026-10-05", 2);
    expect(weeks).toHaveLength(2);
    expect(weeks[1][0].date).toBe("2026-10-04"); // Sunday
    expect(weeks[1][1]).toEqual({ date: "2026-10-05", reviews: 30, level: 4, future: false });
    expect(weeks[1][0].level).toBe(1);
    expect(weeks[1][6]).toMatchObject({ date: "2026-10-10", future: true, level: 0 });
    expect(weeks[0][0].date).toBe("2026-09-27");
  });
});

describe("recallRate", () => {
  it("is the share of review-state cards not forgotten, or null without data", () => {
    expect(recallRate([{ studied: 8, studiedOk: 6 }, { studied: 2, studiedOk: 2 }])).toBe(0.8);
    expect(recallRate([{ studied: 0, studiedOk: 0 }])).toBeNull();
  });
});
