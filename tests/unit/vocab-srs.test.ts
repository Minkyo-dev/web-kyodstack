import { describe, expect, it } from "vitest";
import { applyRating, formatInterval, previewIntervals, type CardState } from "@/features/vocab/domain/srs";

const NEW: CardState = {
  fsrsState: "new", due: "2026-10-05T10:00:00.000Z", stability: null, difficulty: null,
  elapsedDays: 0, scheduledDays: 0, learningSteps: 0, reps: 0, lapses: 0, lastReview: null,
};
const now = new Date("2026-10-05T10:00:00.000Z");
const opts = { retention: 0.9, fuzz: false };

describe("srs (ts-fsrs wrapper, spec §7.2)", () => {
  it("moves a new card into learning on Good and counts the rep", () => {
    const after = applyRating(NEW, 3, now, opts);
    expect(after.fsrsState).toBe("learning");
    expect(after.reps).toBe(1);
    expect(after.lastReview).toBe(now.toISOString());
    expect(new Date(after.due).getTime()).toBeGreaterThan(now.getTime());
    expect(after.stability).toBeGreaterThan(0);
  });

  it("sends Easy straight to review days ahead and Again back within minutes", () => {
    const easy = applyRating(NEW, 4, now, opts);
    expect(easy.fsrsState).toBe("review");
    expect(easy.scheduledDays).toBeGreaterThanOrEqual(1);
    const again = applyRating(NEW, 1, now, opts);
    expect(new Date(again.due).getTime() - now.getTime()).toBeLessThan(10 * 60_000);
  });

  it("counts a lapse when a review card is forgotten", () => {
    const review = applyRating(NEW, 4, now, opts);
    const later = new Date(review.due);
    const lapsed = applyRating(review, 1, later, opts);
    expect(lapsed.fsrsState).toBe("relearning");
    expect(lapsed.lapses).toBe(1);
  });

  it("labels each button with its next interval, growing with the rating", () => {
    const labels = previewIntervals(NEW, now, opts);
    expect(Object.keys(labels)).toEqual(["1", "2", "3", "4"]);
    expect(labels[1]).toMatch(/분$/);
    expect(labels[4]).toMatch(/일$/);
  });
});

describe("formatInterval", () => {
  it("speaks in minutes, hours, days, weeks, months and years", () => {
    const m = 60_000;
    const d = 86_400_000;
    expect(formatInterval(20_000)).toBe("1분");
    expect(formatInterval(10 * m)).toBe("10분");
    expect(formatInterval(5 * 60 * m)).toBe("5시간");
    expect(formatInterval(1 * d)).toBe("1일");
    expect(formatInterval(3 * d)).toBe("3일");
    expect(formatInterval(16 * d)).toBe("2주");
    expect(formatInterval(95 * d)).toBe("3개월");
    expect(formatInterval(365 * d)).toBe("1년");
    expect(formatInterval(548 * d)).toBe("1.5년");
  });
});
