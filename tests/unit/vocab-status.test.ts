import { describe, expect, it } from "vitest";
import { blankTerm, suggestRating } from "@/features/vocab/domain/answer-match";
import { deriveStatus, isMature, nextReviewDate, writebackFor, type CardSnapshot } from "@/features/vocab/domain/status";

const TZ = "America/Toronto";
const snap = (over: Partial<CardSnapshot> = {}): CardSnapshot => ({ fsrsState: "review", due: "2026-10-08T03:00:00.000Z", suspended: false, scheduledDays: 3, ...over });

describe("status (spec §7.5)", () => {
  it("derives 새 단어 / 학습 중 / 학습 완료", () => {
    expect(deriveStatus([snap({ fsrsState: "new" }), snap({ fsrsState: "new" })])).toBe("새 단어");
    expect(deriveStatus([snap(), snap({ fsrsState: "new" })])).toBe("학습 중");
    expect(deriveStatus([snap({ suspended: true }), snap({ suspended: true })])).toBe("학습 완료");
  });

  it("uses the earliest studied, active card for 다음 복습, in local time", () => {
    expect(nextReviewDate([snap(), snap({ due: "2026-10-09T12:00:00.000Z" })], TZ)).toBe("2026-10-07"); // 23:00 local
    expect(nextReviewDate([snap({ fsrsState: "new", due: "2026-10-01T00:00:00.000Z" }), snap({ due: "2026-10-09T12:00:00.000Z" })], TZ)).toBe("2026-10-09");
    expect(nextReviewDate([snap({ suspended: true })], TZ)).toBeNull();
    expect(nextReviewDate([snap({ fsrsState: "new" })], TZ)).toBeNull();
    expect(writebackFor([snap()], TZ)).toEqual({ status: "학습 중", nextReview: "2026-10-07" });
  });

  it("calls a word mature when every active card waits 21 days or more", () => {
    expect(isMature([snap({ scheduledDays: 21 }), snap({ scheduledDays: 40 })])).toBe(true);
    expect(isMature([snap({ scheduledDays: 21 }), snap({ scheduledDays: 5 })])).toBe(false);
    expect(isMature([snap({ suspended: true, scheduledDays: 50 })])).toBe(false);
  });
});

describe("answer matching (spec §7.4)", () => {
  it("suggests Good for an exact answer, Hard for one slip, Again otherwise", () => {
    expect(suggestRating("  Ubiquitous. ", "ubiquitous")).toBe(3);
    expect(suggestRating("ubiquitus", "ubiquitous")).toBe(2);
    expect(suggestRating("ubiquotius", "ubiquitous")).toBe(1);
    expect(suggestRating("rn", "run")).toBe(1); // short words need an exact match
    expect(suggestRating("", "run")).toBeNull();
    expect(suggestRating("run  out of", "run out of")).toBe(3);
  });

  it("blanks the term in the example, or hides the example when the term isn't in it", () => {
    expect(blankTerm("Phones are Ubiquitous now.", "ubiquitous")).toBe("Phones are ___ now.");
    expect(blankTerm("We ran out of milk.", "run out of")).toBeNull();
    expect(blankTerm(null, "x")).toBeNull();
    expect(blankTerm("a (b) c", "(b)")).toBe("a ___ c");
  });
});
