import { z } from "zod";
import { PAUSE_REASONS } from "../domain/scheduler.constants";

const instant = z.iso.datetime({ offset: true });
const optionalScore = z.coerce.number().int().min(1).max(5).nullable().optional();
const note = z.string().trim().max(5000).nullable().optional();

export const startWorkSessionSchema = z
  .object({ taskId: z.uuid().optional(), blockId: z.uuid().optional() })
  .refine((v) => v.taskId || v.blockId, "작업 또는 일정 블록이 필요합니다.");
export type StartWorkSessionInput = z.infer<typeof startWorkSessionSchema>;

/** Switch = hold the open session (no summary) and start another one, atomically. */
export const switchWorkSessionSchema = startWorkSessionSchema;

export const stopWorkSessionSchema = z.object({
  sessionId: z.uuid(),
  /** Defaults to now. Editable for a timer that was left running. */
  endedAt: instant.optional(),
  focusScore: optionalScore,
  moodScore: optionalScore,
  energyScore: optionalScore,
  note,
  /** [할 일 완료]: stop and complete in one transaction. */
  completeTask: z.boolean().optional(),
});
export type StopWorkSessionInput = z.infer<typeof stopWorkSessionSchema>;

export const pauseWorkSessionSchema = z.object({
  sessionId: z.uuid(),
  reason: z.enum(PAUSE_REASONS).optional(),
});
export type PauseWorkSessionInput = z.infer<typeof pauseWorkSessionSchema>;

export const setPauseReasonSchema = z.object({ pauseId: z.uuid(), reason: z.enum(PAUSE_REASONS) });
export type SetPauseReasonInput = z.infer<typeof setPauseReasonSchema>;

export const saveWorkLogNoteSchema = z.object({ sessionId: z.uuid(), note: z.string().trim().max(5000) });
export type SaveWorkLogNoteInput = z.infer<typeof saveWorkLogNoteSchema>;

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
