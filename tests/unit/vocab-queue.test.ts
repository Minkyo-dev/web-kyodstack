import { describe, expect, it } from "vitest";
import { buildQueue, type QueueCard } from "@/features/vocab/domain/queue";
import { localDayRange } from "@/features/scheduler/utils/timezone";

const TZ = "America/Toronto";
const todayEnd = new Date(localDayRange("2026-10-05", TZ).end);
const settings = { newPerDay: 20, reviewsPerDay: 200, directions: ["recognition", "recall"] as const };
const card = (id: string, wordId: string, over: Partial<QueueCard> = {}): QueueCard => ({
  id, wordId, direction: "recognition", fsrsState: "review", due: "2026-10-05T12:00:00.000Z", suspended: false, wordCreatedAt: "2026-10-01T00:00:00.000Z", ...over,
});
const base = { todayEnd, doneReviewsToday: 0, newIntroducedToday: 0, reviewedTodayWordIds: new Set<string>(), settings };

describe("buildQueue (spec §7.3)", () => {
  it("takes due reviews by due time and stops at the local end of today", () => {
    const q = buildQueue({
      ...base,
      cards: [
        card("late", "w1", { due: "2026-10-06T03:59:00.000Z" }), // 23:59 Toronto: still today
        card("early", "w2", { due: "2026-10-05T09:00:00.000Z" }),
        card("tomorrow", "w3", { due: "2026-10-06T04:01:00.000Z" }), // 00:01 Toronto tomorrow
      ],
    });
    expect(q.map((c) => c.id)).toEqual(["early", "late"]);
  });

  it("buries the sibling of a word already in the queue or reviewed today", () => {
    const q = buildQueue({
      ...base,
      reviewedTodayWordIds: new Set(["w2"]),
      cards: [
        card("w1-rec", "w1"),
        card("w1-call", "w1", { direction: "recall" }),
        card("w2-call", "w2", { direction: "recall" }),
      ],
    });
    expect(q.map((c) => c.id)).toEqual(["w1-rec"]);
  });

  it("caps reviews and new cards by what is left today, and skips suspended cards and other directions", () => {
    const q = buildQueue({
      ...base,
      doneReviewsToday: 199,
      newIntroducedToday: 19,
      settings: { ...settings, directions: ["recognition"] },
      cards: [
        card("r1", "w1"),
        card("r2", "w2"),
        card("n1", "w3", { fsrsState: "new" }),
        card("n2", "w4", { fsrsState: "new" }),
        card("s", "w5", { suspended: true }),
        card("recall", "w6", { direction: "recall" }),
      ],
    });
    expect(q.map((c) => c.id)).toEqual(["r1", "n1"]);
  });

  it("orders new cards by word creation, recognition first, and mixes one new after three reviews", () => {
    const reviews = ["r1", "r2", "r3", "r4"].map((id, i) => card(id, `rw${i}`, { due: `2026-10-05T0${i + 1}:00:00.000Z` }));
    const news = [
      card("nB", "wB", { fsrsState: "new", wordCreatedAt: "2026-10-03T00:00:00.000Z" }),
      card("nA-call", "wA", { fsrsState: "new", direction: "recall", wordCreatedAt: "2026-10-02T00:00:00.000Z" }),
      card("nA-rec", "wA", { fsrsState: "new", wordCreatedAt: "2026-10-02T00:00:00.000Z" }),
    ];
    const q = buildQueue({ ...base, cards: [...news, ...reviews] });
    expect(q.map((c) => c.id)).toEqual(["r1", "r2", "r3", "nA-rec", "r4", "nB"]);
  });
});
