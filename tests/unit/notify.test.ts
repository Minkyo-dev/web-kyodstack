import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, inQuietHours, selectNotifications, type NotifyInput } from "@/features/assistant/domain/notify";

const NOW = "2026-10-02T14:00:00Z";
const at = (min: number) => new Date(Date.parse(NOW) + min * 60_000).toISOString();
const base: NotifyInput = {
  now: NOW,
  localDate: "2026-10-02",
  localHour: 10,
  weekStart: "2026-09-28",
  eveningHour: 18,
  prefs: DEFAULT_PREFS,
  sentToday: 0,
  blocks: [],
  missedHabits: [],
  checkinDone: false,
  dayHadActivity: true,
  quietChanges: [],
};
const block = (id: string, min: number, over = {}) => ({ id, startsAt: at(min), taskTitle: `작업 ${id}`, taskOpen: true, status: "planned", ...over });

describe("inQuietHours", () => {
  it("handles plain, wrapping and empty ranges", () => {
    expect([21, 22, 23, 0, 6, 7].map((h) => inQuietHours(h, 22, 7))).toEqual([false, true, true, true, true, false]);
    expect([12, 13, 14].map((h) => inQuietHours(h, 13, 14))).toEqual([false, true, false]);
    expect(inQuietHours(3, 5, 5)).toBe(false);
  });
});

describe("block_soon", () => {
  it("only planned blocks of open tasks starting within 15 minutes, soonest first", () => {
    const out = selectNotifications({
      ...base,
      blocks: [block("a", 14), block("b", 5), block("c", 16), block("d", -1), block("e", 3, { status: "skipped" }), block("f", 4, { taskOpen: false })],
    });
    expect(out.map((n) => [n.dedupeKey, n.title])).toEqual([["block:b", "5분 뒤: 작업 b"], ["block:a", "14분 뒤: 작업 a"]]);
  });
});

describe("daily rules", () => {
  it("check-in after the evening hour on an active day without a check-in", () => {
    expect(selectNotifications({ ...base, localHour: 18 })[0]).toMatchObject({ kind: "checkin", dedupeKey: "checkin:2026-10-02" });
    expect(selectNotifications({ ...base, localHour: 17 })).toEqual([]);
    expect(selectNotifications({ ...base, localHour: 19, checkinDone: true })).toEqual([]);
    expect(selectNotifications({ ...base, localHour: 19, dayHadActivity: false })).toEqual([]);
  });
  it("missed habits from 8:00, one notification naming them", () => {
    expect(selectNotifications({ ...base, localHour: 7, prefs: { ...DEFAULT_PREFS, quiet_end: 6 }, missedHabits: ["스트레칭"] })).toEqual([]);
    const [n] = selectNotifications({ ...base, missedHabits: ["스트레칭", "독서"] });
    expect(n).toMatchObject({ kind: "habit_missed", dedupeKey: "habit:2026-10-02", title: "어제 놓친 습관: 스트레칭, 독서" });
  });
  it("a quiet change once per week, linking to it", () => {
    const [n] = selectNotifications({ ...base, quietChanges: [{ id: "m1", title: "영어" }] });
    expect(n).toMatchObject({ kind: "change_quiet", dedupeKey: "quiet:m1:2026-09-28", url: "/scheduler/directive?mission=m1#mission-detail" });
    expect(selectNotifications({ ...base, localHour: 8, quietChanges: [{ id: "m1", title: "영어" }] })).toEqual([]);
  });
});

describe("respect", () => {
  const busy: NotifyInput = { ...base, localHour: 19, blocks: [block("a", 5)], missedHabits: ["x"], quietChanges: [{ id: "m1", title: "t" }] };
  it("orders block → check-in → habit → quiet change and applies the daily cap", () => {
    expect(selectNotifications(busy).map((n) => n.kind)).toEqual(["block_soon", "checkin", "habit_missed", "change_quiet"]);
    expect(selectNotifications({ ...busy, sentToday: 2 }).map((n) => n.kind)).toEqual(["block_soon", "checkin"]);
    expect(selectNotifications({ ...busy, sentToday: 4 })).toEqual([]);
  });
  it("switches and quiet hours", () => {
    expect(selectNotifications({ ...busy, prefs: { ...DEFAULT_PREFS, block_soon: false, checkin: false } }).map((n) => n.kind)).toEqual(["habit_missed", "change_quiet"]);
    expect(selectNotifications({ ...busy, localHour: 23 })).toEqual([]);
  });
});
