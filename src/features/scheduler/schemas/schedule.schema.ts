import { z } from "zod";

const instant = z.iso.datetime({ offset: true });

export const scheduleTaskSchema = z.object({
  taskId: z.uuid(),
  startsAt: instant,
  /** Omit to let the system size the block from the duration recommendation. */
  endsAt: instant.optional(),
});
export type ScheduleTaskInput = z.infer<typeof scheduleTaskSchema>;

export const moveBlockSchema = z.object({
  blockId: z.uuid(),
  startsAt: instant,
  endsAt: instant,
});
export type MoveBlockInput = z.infer<typeof moveBlockSchema>;

export const setBlockStatusSchema = z.object({
  blockId: z.uuid(),
  status: z.enum(["planned", "completed", "skipped", "cancelled"]),
});
export type SetBlockStatusInput = z.infer<typeof setBlockStatusSchema>;

/** Click-drag on an empty calendar range: create a task and its block in one go. */
export const createTaskInRangeSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력해 주세요.").max(200),
  startsAt: instant,
  endsAt: instant,
});
export type CreateTaskInRangeInput = z.infer<typeof createTaskInRangeSchema>;

export const rescheduleBlockSchema = z.object({ blockId: z.uuid(), startsAt: instant });
export type RescheduleBlockInput = z.infer<typeof rescheduleBlockSchema>;

export const blockIdSchema = z.object({ blockId: z.uuid() });

export const updateSchedulerSettingsSchema = z.object({ showActualDefault: z.boolean() });
export type UpdateSchedulerSettingsInput = z.infer<typeof updateSchedulerSettingsSchema>;
