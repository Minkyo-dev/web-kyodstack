import { z } from "zod";

export type ReviewScope = { kind: "all" } | { kind: "topic"; topic: string };

/** `?scope=all` or `?scope=topic:<name>`; anything else means all. */
export function parseScope(raw: string | undefined): ReviewScope {
  if (raw?.startsWith("topic:")) {
    const topic = raw.slice("topic:".length).trim().slice(0, 50);
    if (topic) return { kind: "topic", topic };
  }
  return { kind: "all" };
}

export const reviewSchema = z.object({
  cardId: z.uuid(),
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  durationMs: z.number().int().min(0).transform((ms) => Math.min(ms, 3_600_000)),
  clientReviewId: z.uuid(),
  expectedReps: z.number().int().min(0),
});

export const cardIdSchema = z.object({ cardId: z.uuid() });
export const setLearnedSchema = z.object({ wordId: z.uuid(), learned: z.boolean() });

export const studySettingsSchema = z.object({
  newPerDay: z.coerce.number().int().min(0).max(200),
  reviewsPerDay: z.coerce.number().int().min(1).max(1000),
  desiredRetention: z.coerce.number().min(0.7).max(0.97),
  directions: z.array(z.enum(["recognition", "recall"])).min(1).max(2).transform((d) => [...new Set(d)]),
});

export const reminderSchema = z.object({
  reminderEnabled: z.boolean(),
  reminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM 형식으로 입력해 주세요."),
});
