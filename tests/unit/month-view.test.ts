import { describe, expect, it } from "vitest";
import { isMonthKey, localMonth } from "@/features/scheduler/utils/month";

describe("localMonth", () => {
  it("covers whole weeks around the month (Monday start)", () => {
    // October 2026 starts on a Thursday and ends on a Saturday.
    const m = localMonth("2026-10", 1);
    expect(m.startDate).toBe("2026-09-28");
    expect(m.endDate).toBe("2026-11-02"); // exclusive
    expect(m.prev).toBe("2026-09");
    expect(m.next).toBe("2026-11");
    expect(m.label).toBe("2026년 10월");
  });
  it("respects a Sunday week start and year boundaries", () => {
    const m = localMonth("2027-01", 0);
    expect(m.startDate).toBe("2026-12-27");
    expect(m.endDate).toBe("2027-02-07");
    expect(m.prev).toBe("2026-12");
  });
});

describe("isMonthKey", () => {
  it("accepts yyyy-MM only", () => {
    expect(isMonthKey("2026-10")).toBe(true);
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey("2026-1")).toBe(false);
    expect(isMonthKey("2026-10-01")).toBe(false);
  });
});
