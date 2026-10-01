import { describe, expect, it } from "vitest";
import { canCheckToday, focusMinutesFor, formatWeekdays, isDueOn, isoWeekday } from "@/features/direction/domain/habits";

const habit = (over: Partial<{ rule: "check" | "focus"; status: "active" | "archived"; weekdays: number[] }> = {}) => ({
  rule: "check" as const,
  status: "active" as const,
  weekdays: [1, 2, 3, 4, 5],
  ...over,
});

describe("isoWeekday", () => {
  it("maps local dates to ISO weekdays", () => {
    expect(isoWeekday("2026-09-28")).toBe(1); // Monday
    expect(isoWeekday("2026-10-04")).toBe(7); // Sunday
    expect(isoWeekday("2026-03-08")).toBe(7); // DST start in Toronto, still Sunday
  });
});

describe("isDueOn / canCheckToday", () => {
  it("needs an active habit scheduled on that weekday", () => {
    expect(isDueOn(habit(), "2026-09-30")).toBe(true);
    expect(isDueOn(habit(), "2026-10-03")).toBe(false); // Saturday
    expect(isDueOn(habit({ status: "archived" }), "2026-09-30")).toBe(false);
  });
  it("only check-rule habits can be ticked by hand", () => {
    expect(canCheckToday(habit(), "2026-09-30")).toBe(true);
    expect(canCheckToday(habit({ rule: "focus" }), "2026-09-30")).toBe(false);
    expect(canCheckToday(habit(), "2026-10-03")).toBe(false);
  });
});

describe("focusMinutesFor", () => {
  const s = (over: object) => ({
    source: "timer",
    started_at: "2026-09-30T13:00:00Z",
    ended_at: "2026-09-30T13:30:00Z",
    pauses: [],
    task: { protocol_id: "pr1" },
    ...over,
  });
  it("sums focused timer minutes on the protocol's tasks", () => {
    const sessions = [
      s({}),
      s({ pauses: [{ paused_at: "2026-09-30T13:10:00Z", resumed_at: "2026-09-30T13:20:00Z" }] }),
      s({ source: "manual" }),
      s({ task: { protocol_id: "other" } }),
      s({ ended_at: null }),
    ];
    expect(focusMinutesFor("pr1", sessions)).toBe(50);
  });
});

describe("formatWeekdays", () => {
  it("names the days, with shortcuts for every day and weekdays", () => {
    expect(formatWeekdays([1, 2, 3, 4, 5, 6, 7])).toBe("매일");
    expect(formatWeekdays([5, 1, 2, 3, 4])).toBe("평일");
    expect(formatWeekdays([1, 3, 5])).toBe("월 수 금");
  });
});
