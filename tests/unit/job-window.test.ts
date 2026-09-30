import { describe, expect, it } from "vitest";
import {
  inLocalWindow,
  isFirstDayOfWeek,
  localHour,
  previousWeekStart,
  safeEqual,
} from "@/features/jobs/utils/job-window";

const TO = "America/Toronto";

describe("job windows (spec §46)", () => {
  it("uses the user's local hour across DST", () => {
    expect(localHour(new Date("2026-09-30T11:00:00Z"), TO)).toBe(7); // EDT
    expect(localHour(new Date("2026-12-02T11:00:00Z"), TO)).toBe(6); // EST
    expect(inLocalWindow(new Date("2026-09-30T11:00:00Z"), TO, 5, 10)).toBe(true);
    expect(inLocalWindow(new Date("2026-09-30T15:00:00Z"), TO, 5, 10)).toBe(false);
  });
  it("the same UTC cron time maps to different local days per zone", () => {
    const at = new Date("2026-09-28T02:00:00Z"); // Sunday 22:00 Toronto, Monday 11:00 Seoul
    expect(isFirstDayOfWeek(at, TO, 1)).toBe(false);
    expect(isFirstDayOfWeek(at, "Asia/Seoul", 1)).toBe(true);
  });
  it("previous week relative to local today", () => {
    expect(previousWeekStart(new Date("2026-09-28T12:00:00Z"), TO, 1)).toBe("2026-09-21");
    expect(previousWeekStart(new Date("2026-09-28T02:00:00Z"), TO, 1)).toBe("2026-09-14"); // still Sunday locally
  });
  it("safeEqual", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
