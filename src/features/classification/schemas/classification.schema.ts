import { z } from "zod";
import { TAG_COLORS, TASK_TYPES } from "../domain/classification.types";

export const tagName = z
  .string()
  .trim()
  .min(1, "이름을 입력해 주세요.")
  .max(100)
  .refine((s) => !/[#,]/.test(s), "#과 쉼표는 쓸 수 없습니다.");
export const domainName = z
  .string()
  .trim()
  .min(1, "이름을 입력해 주세요.")
  .max(60)
  .refine((s) => !s.includes("@"), "@는 쓸 수 없습니다.");
export const taskType = z.enum(TASK_TYPES);

export const createTagSchema = z.object({ name: tagName, color: z.enum(TAG_COLORS).nullable().optional() });
export const updateTagSchema = z.object({ tagId: z.uuid(), name: tagName, color: z.enum(TAG_COLORS).nullable() });
export const tagIdSchema = z.object({ tagId: z.uuid() });
export const createDomainSchema = z.object({ name: domainName, parentId: z.uuid().nullable().optional() });
export const updateDomainSchema = z.object({ domainId: z.uuid(), name: domainName, parentId: z.uuid().nullable() });
export const domainIdSchema = z.object({ domainId: z.uuid() });
export const updateTemplateClassificationSchema = z.object({
  templateId: z.uuid(),
  taskType: taskType.nullable(),
  domainId: z.uuid().nullable(),
  tagIds: z.array(z.uuid()).max(20),
  defaultEstimateMinutes: z.coerce.number().int().min(1).max(720).nullable(),
  applyToTasks: z.boolean(),
});
export const setTaskTagsSchema = z.object({ taskId: z.uuid(), tagIds: z.array(z.uuid()).max(20) });

export type CreateTagInput = z.infer<typeof createTagSchema>;
export type UpdateTagInput = z.infer<typeof updateTagSchema>;
export type CreateDomainInput = z.infer<typeof createDomainSchema>;
export type UpdateDomainInput = z.infer<typeof updateDomainSchema>;
export type UpdateTemplateClassificationInput = z.infer<typeof updateTemplateClassificationSchema>;
export type SetTaskTagsInput = z.infer<typeof setTaskTagsSchema>;
