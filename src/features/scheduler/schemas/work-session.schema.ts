import { z } from "zod";

const instant = z.iso.datetime({ offset: true });
const optionalScore = z.coerce.number().int().min(1).max(5).nullable().optional();
const note = z.string().trim().max(2000).nullable().optional();

export const startWorkSessionSchema = z
  .object({ taskId: z.uuid().optional(), blockId: z.uuid().optional() })
  .refine((v) => v.taskId || v.blockId, "작업 또는 일정 블록이 필요합니다.");
export type StartWorkSessionInput = z.infer<typeof startWorkSessionSchema>;

export const stopWorkSessionSchema = z.object({
  sessionId: z.uuid(),
  /** Defaults to now. Editable for a timer that was left running. */
  endedAt: instant.optional(),
  focusScore: optionalScore,
  moodScore: optionalScore,
  energyScore: optionalScore,
  note,
});
export type StopWorkSessionInput = z.infer<typeof stopWorkSessionSchema>;

export const manualWorkSessionSchema = z.object({
  taskId: z.uuid(),
  startedAt: instant,
  endedAt: instant,
  focusScore: optionalScore,
  moodScore: optionalScore,
  energyScore: optionalScore,
  note,
});
export type ManualWorkSessionInput = z.infer<typeof manualWorkSessionSchema>;

export const sessionIdSchema = z.object({ sessionId: z.uuid() });
