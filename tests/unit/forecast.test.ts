import { describe, expect, it } from "vitest";
import { forecast, forecastText } from "@/features/direction/domain/forecast";

const base = { ratio: 0.5, ratioBefore: 0.3, createdDate: "2026-08-01", deadline: null as string | null, today: "2026-10-01", openNumeric: false };

describe("forecast-v1", () => {
  it("uses the last 28 days when trustworthy", () => {
    // 0.2 per 28 days → 0.5 left = 70 days → 2026-12-10.
    const f = forecast(base);
    expect(f).toEqual({ state: "eta", basis: "recent", date: "2026-12-10", daysLate: null });
    expect(forecastText(f)).toBe("최근 4주 속도면 12월 10일쯤 달성.");
  });
  it("falls back to the average since creation with an open numeric criterion or a young mission", () => {
    // age 61 days, 0.5 done → 61 more days → 2026-12-01.
    expect(forecast({ ...base, openNumeric: true })).toMatchObject({ basis: "average", date: "2026-12-01" });
    expect(forecast({ ...base, createdDate: "2026-09-10", ratio: 0.3 })).toMatchObject({ basis: "average" });
  });
  it("compares with the deadline", () => {
    expect(forecast({ ...base, deadline: "2026-12-01" })).toMatchObject({ daysLate: 9 });
    expect(forecastText(forecast({ ...base, deadline: "2026-12-01" }))).toBe("최근 4주 속도면 12월 10일쯤 달성 · 마감보다 9일 늦어요.");
    expect(forecastText(forecast({ ...base, deadline: "2026-12-20" }))).toBe("최근 4주 속도면 12월 10일쯤 달성 · 마감보다 10일 여유.");
  });
  it("none, done, collecting, stalled, far", () => {
    expect(forecast({ ...base, ratio: null })).toEqual({ state: "none" });
    expect(forecast({ ...base, ratio: 1 })).toEqual({ state: "done" });
    expect(forecast({ ...base, createdDate: "2026-09-25" })).toEqual({ state: "collecting", ageDays: 6 });
    expect(forecast({ ...base, ratioBefore: 0.5 })).toEqual({ state: "stalled", basis: "recent" });
    expect(forecast({ ...base, ratio: 0.01, ratioBefore: 0 })).toEqual({ state: "far", basis: "recent" });
    expect(forecastText({ state: "none" })).toBeNull();
    expect(forecastText({ state: "collecting", ageDays: 6 })).toBe("시작한 지 6일 — 2주가 지나면 달성일을 예측해요.");
  });
});
