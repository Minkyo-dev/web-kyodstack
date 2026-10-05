import { describe, expect, it } from "vitest";
import { outboxBackoffMs } from "@/features/vocab/domain/sync";
import { parseScope, reviewSchema, studySettingsSchema } from "@/features/vocab/schemas/review.schema";

describe("parseScope", () => {
  it("reads all and topic scopes and falls back to all", () => {
    expect(parseScope(undefined)).toEqual({ kind: "all" });
    expect(parseScope("all")).toEqual({ kind: "all" });
    expect(parseScope("topic:일상")).toEqual({ kind: "topic", topic: "일상" });
    expect(parseScope("topic:")).toEqual({ kind: "all" });
    expect(parseScope("weird")).toEqual({ kind: "all" });
  });
});

describe("reviewSchema", () => {
  const ok = { cardId: "6f1c1f9e-1b2a-4c3d-8e4f-5a6b7c8d9e0f", rating: 3, durationMs: 4200, clientReviewId: "7f1c1f9e-1b2a-4c3d-8e4f-5a6b7c8d9e0f", expectedReps: 0 };
  it("accepts a rating 1–4 and clamps nothing silently", () => {
    expect(reviewSchema.parse(ok)).toEqual(ok);
    expect(reviewSchema.safeParse({ ...ok, rating: 5 }).success).toBe(false);
    expect(reviewSchema.safeParse({ ...ok, durationMs: -1 }).success).toBe(false);
    expect(reviewSchema.safeParse({ ...ok, expectedReps: -1 }).success).toBe(false);
  });
  it("caps very long think times at an hour", () => {
    expect(reviewSchema.parse({ ...ok, durationMs: 10_000_000 }).durationMs).toBe(3_600_000);
  });
});

describe("studySettingsSchema", () => {
  it("validates the limits and needs at least one direction", () => {
    expect(studySettingsSchema.parse({ newPerDay: "15", reviewsPerDay: "150", desiredRetention: "0.9", directions: ["recall"] })).toEqual({
      newPerDay: 15, reviewsPerDay: 150, desiredRetention: 0.9, directions: ["recall"],
    });
    expect(studySettingsSchema.safeParse({ newPerDay: 15, reviewsPerDay: 150, desiredRetention: 0.9, directions: [] }).success).toBe(false);
    expect(studySettingsSchema.safeParse({ newPerDay: 500, reviewsPerDay: 150, desiredRetention: 0.9, directions: ["recall"] }).success).toBe(false);
    expect(studySettingsSchema.safeParse({ newPerDay: 5, reviewsPerDay: 150, desiredRetention: 0.99, directions: ["recall"] }).success).toBe(false);
  });
});

describe("outboxBackoffMs", () => {
  it("doubles from one minute up to an hour", () => {
    expect([0, 1, 2, 5, 6, 9].map(outboxBackoffMs)).toEqual([60_000, 120_000, 240_000, 1_920_000, 3_600_000, 3_600_000]);
  });
});
