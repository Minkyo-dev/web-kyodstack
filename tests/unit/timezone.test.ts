import { describe, expect, it } from "vitest";
import {
  addLocalDays,
  isLocalDateString,
  localDayRange,
  localWeek,
  toLocalDate,
  todayLocalDate,
} from "@/features/scheduler/utils/timezone";

const TO = "America/Toronto";

describe("timezone helpers", () => {
  it("assigns an instant near UTC midnight to the previous Toronto day (spec §58)", () => {
    expect(toLocalDate("2026-09-30T02:30:00Z", TO)).toBe("2026-09-29");
    expect(todayLocalDate(TO, new Date("2026-09-30T03:59:00Z"))).toBe("2026-09-29");
    expect(todayLocalDate(TO, new Date("2026-09-30T04:00:00Z"))).toBe("2026-09-30");
  });

  it("day range is 24h normally", () => {
    expect(localDayRange("2026-09-29", TO)).toEqual({
      start: "2026-09-29T04:00:00.000Z",
      end: "2026-09-30T04:00:00.000Z",
    });
  });

  it("day range is 25h on the DST fall-back day (never a fixed offset)", () => {
    const { start, end } = localDayRange("2026-11-01", TO);
    expect(start).toBe("2026-11-01T04:00:00.000Z");
    expect(end).toBe("2026-11-02T05:00:00.000Z");
  });

  it("builds a Monday-start week", () => {
    const w = localWeek("2026-09-30", TO, 1);
    expect(w.startDate).toBe("2026-09-28");
    expect(w.endDate).toBe("2026-10-05");
    expect(w.days).toHaveLength(7);
    expect(w.days[6]).toBe("2026-10-04");
  });

  it("builds a Sunday-start week", () => {
    expect(localWeek("2026-09-30", TO, 0).startDate).toBe("2026-09-27");
  });

  it("adds local days across DST", () => {
    expect(addLocalDays("2026-10-31", 2, TO)).toBe("2026-11-02");
  });

  it("validates yyyy-MM-dd strings", () => {
    expect(isLocalDateString("2026-02-29")).toBe(false);
    expect(isLocalDateString("2028-02-29")).toBe(true);
    expect(isLocalDateString("2026-9-1")).toBe(false);
  });
});

describe("localDateTimeToIso", () => {
  it("converts Toronto wall time to UTC across DST", async () => {
    const { localDateTimeToIso, toLocalTime } = await import("@/features/scheduler/utils/timezone");
    expect(localDateTimeToIso("2026-09-29", "10:00", TO)).toBe("2026-09-29T14:00:00.000Z");
    expect(localDateTimeToIso("2026-11-02", "10:00", TO)).toBe("2026-11-02T15:00:00.000Z");
    expect(toLocalTime("2026-11-02T15:00:00.000Z", TO)).toBe("10:00");
  });
});
