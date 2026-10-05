import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, inQuietHours, selectNotifications, type NotifyInput } from "@/features/assistant/domain/notify";

const NOW = "2026-10-02T14:00:00Z";
const at = (min: number) => new Date(Date.parse(NOW) + min * 60_000).toISOString();
const base: NotifyInput = {
  now: NOW,
  localDate: "2026-10-02",
  localHour: 10,
  localTime: "10:00",
  weekStart: "2026-09-28",
  eveningHour: 18,
  prefs: DEFAULT_PREFS,
  sentToday: 0,
  blocks: [],
  missedHabits: [],
  checkinDone: false,
  dayHadActivity: true,
  quietChanges: [],
  vocabDue: null,
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

describe("vocab_due (ADR 0046, notify-v2)", () => {
  const evening = { ...base, localHour: 20, localTime: "20:30", dayHadActivity: false, vocabDue: { reviews: 3, newCards: 2, reminderTime: "20:30" } };
  it("fires once the local time reaches the reminder time, with today's counts", () => {
    expect(selectNotifications({ ...evening, localTime: "20:29" })).toEqual([]);
    expect(selectNotifications(evening)).toEqual([
      { kind: "vocab_due", dedupeKey: "vocab:2026-10-02", title: "오늘 복습할 단어 3개 · 새 단어 2개", body: "몇 분이면 끝나요. 지금 한 번 볼까요?", url: "/english/review" },
    ]);
  });
  it("stays quiet with nothing to review, the switch off, or no vocab facts", () => {
    expect(selectNotifications({ ...evening, vocabDue: { reviews: 0, newCards: 0, reminderTime: "20:30" } })).toEqual([]);
    expect(selectNotifications({ ...evening, prefs: { ...DEFAULT_PREFS, vocab_due: false } })).toEqual([]);
    expect(selectNotifications({ ...evening, vocabDue: null })).toEqual([]);
  });
  it("ranks after the check-in and before habits", () => {
    const busy = { ...evening, dayHadActivity: true, missedHabits: ["운동"], quietChanges: [{ id: "m1", title: "영어" }] };
    expect(selectNotifications(busy).map((n) => n.kind)).toEqual(["checkin", "vocab_due", "habit_missed", "change_quiet"]);
  });
});
