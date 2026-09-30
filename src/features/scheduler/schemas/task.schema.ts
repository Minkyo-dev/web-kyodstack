import { z } from "zod";
import { isLocalDateString } from "../utils/timezone";

const localDate = z.string().refine(isLocalDateString, "날짜 형식이 올바르지 않습니다.");
const score = z.coerce.number().int().min(1).max(5);
const estimate = z.coerce.number().int().min(1, "1분 이상이어야 합니다.").max(720, "12시간 이하로 입력해 주세요.");

export const taskIdSchema = z.object({ taskId: z.uuid() });

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력해 주세요.").max(200),
  userEstimatedMinutes: estimate.optional(),
  targetDate: localDate.optional(),
  templateName: z.string().trim().max(100).optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z.object({
  taskId: z.uuid(),
  title: z.string().trim().min(1, "제목을 입력해 주세요.").max(200),
  description: z.string().max(5000).nullable(),
  userEstimatedMinutes: estimate.nullable(),
  targetDate: localDate.nullable(),
  priority: score,
  complexity: score,
  /** Empty string or null clears the template; a new name creates it. */
  templateName: z.string().trim().max(100).nullable(),
});
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
