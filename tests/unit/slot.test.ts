import { describe, expect, it } from "vitest";
import { dominantHour, pickSlotDay } from "@/features/assistant/domain/slot";
import { addLocalDays, localDateTimeToIso } from "@/features/scheduler/utils/timezone";

const TZ = "America/Toronto";
const pick = (now: string, weekdays: number[], hour = 7) =>
  pickSlotDay({
    today: "2026-10-02", // Friday
    weekdays,
    hour,
    now: new Date(now),
    addDays: (d, n) => addLocalDays(d, n, TZ),
    startOf: (d, t) => localDateTimeToIso(d, t, TZ),
  });

describe("slot-v1", () => {
  it("dominant hour needs 4 sessions, 3 in the hour and half the share", () => {
    expect(dominantHour([7, 7, 7, 9])).toEqual({ hour: 7, count: 3 });
    expect(dominantHour([7, 7, 7])).toBeNull();
    expect(dominantHour([7, 7, 9, 9])).toBeNull();
    expect(dominantHour([9, 9, 9, 7, 7, 7])).toEqual({ hour: 7, count: 3 });
  });
  it("today when the hour is ≥ 5 minutes ahead, else the next fitting weekday within 7 days", () => {
    // 10:00Z = 06:00 EDT on Friday 2026-10-02.
    expect(pick("2026-10-02T10:00:00Z", [])).toEqual({ date: "2026-10-02", startsAt: "2026-10-02T11:00:00.000Z" });
    expect(pick("2026-10-02T10:57:00Z", [])?.date).toBe("2026-10-03");
    expect(pick("2026-10-02T10:00:00Z", [1])?.date).toBe("2026-10-05");
    expect(pick("2026-10-02T12:00:00Z", [5])?.date).toBe("2026-10-09");
  });
});
