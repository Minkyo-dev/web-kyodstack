import { describe, expect, it } from "vitest";
import { addMonthsToKey, isDisabledDate, monthGrid, moveDate } from "@/lib/month-grid";

describe("monthGrid", () => {
  it("September 2026, weeks start Monday: 5 rows, leading Aug 31, trailing Oct 4", () => {
    const g = monthGrid("2026-09", 1);
    expect(g.length).toBe(5);
    expect(g[0][0]).toEqual({ date: "2026-08-31", inMonth: false });
    expect(g[0][1]).toEqual({ date: "2026-09-01", inMonth: true });
    expect(g[4][6]).toEqual({ date: "2026-10-04", inMonth: false });
  });
  it("weeks start Sunday", () => {
    const g = monthGrid("2026-09", 0);
    expect(g[0][0].date).toBe("2026-08-30");
    expect(g[0][2].date).toBe("2026-09-01");
  });
  it("every row has 7 days and dates are consecutive", () => {
    const flat = monthGrid("2026-02", 1).flat();
    expect(flat.every((d, i) => i === 0 || Date.parse(d.date) - Date.parse(flat[i - 1].date) === 86_400_000)).toBe(true);
  });
});

describe("navigation", () => {
  it("addMonthsToKey across years", () => {
    expect(addMonthsToKey("2026-12", 1)).toBe("2027-01");
    expect(addMonthsToKey("2026-01", -1)).toBe("2025-12");
  });
  it("moveDate by days (keyboard arrows)", () => {
    expect(moveDate("2026-09-30", 1)).toBe("2026-10-01");
    expect(moveDate("2026-03-01", -7)).toBe("2026-02-22");
  });
});

describe("isDisabledDate", () => {
  it("respects min and max (inclusive)", () => {
    expect(isDisabledDate("2026-09-30", { max: "2026-09-30" })).toBe(false);
    expect(isDisabledDate("2026-10-01", { max: "2026-09-30" })).toBe(true);
    expect(isDisabledDate("2026-09-01", { min: "2026-09-02" })).toBe(true);
    expect(isDisabledDate("2026-09-01", {})).toBe(false);
  });
});
