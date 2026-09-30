import { z } from "zod";
import { isLocalDateString } from "@/features/scheduler/utils/timezone";
import { MILESTONE_STATUSES, PROJECT_STATUSES } from "../domain/project.types";

const localDate = z.string().refine(isLocalDateString, "날짜 형식이 올바르지 않습니다.");
const name = z.string().trim().min(1, "이름을 입력해 주세요.").max(120);
const description = z.string().trim().max(5000).nullable().optional();

export const createProjectSchema = z.object({
  name,
  description,
  targetDate: localDate.nullable().optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z
  .object({
    projectId: z.uuid(),
    name,
    description,
    status: z.enum(PROJECT_STATUSES),
    priority: z.coerce.number().int().min(1).max(5),
    startDate: localDate.nullable(),
    targetDate: localDate.nullable(),
  })
  .refine((v) => !v.startDate || !v.targetDate || v.targetDate >= v.startDate, {
    message: "목표일은 시작일 이후여야 합니다.",
    path: ["targetDate"],
  });
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const createMilestoneSchema = z.object({
  projectId: z.uuid(),
  name,
  targetDate: localDate.nullable().optional(),
});
export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>;

export const updateMilestoneSchema = z.object({
  milestoneId: z.uuid(),
  name,
  description,
  status: z.enum(MILESTONE_STATUSES),
  targetDate: localDate.nullable(),
  sortOrder: z.coerce.number().int().min(0).max(10_000),
});
export type UpdateMilestoneInput = z.infer<typeof updateMilestoneSchema>;
