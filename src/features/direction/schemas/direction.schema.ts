import { z } from "zod";
import { isLocalDateString } from "@/features/scheduler/utils/timezone";
import { ARCHIVABLE_STATUSES, CRITERION_KINDS, HABIT_RULES, MISSION_STATUSES, type HabitRule } from "../domain/direction.types";

const localDate = z.string().refine(isLocalDateString, "날짜 형식이 올바르지 않습니다.");
const required = (max: number, message = "내용을 입력해 주세요.") => z.string().trim().min(1, message).max(max);
const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional().transform((v) => (v ? v : null));
const sortOrder = z.coerce.number().int().min(0).max(10_000);

export const setPurposeSchema = z.object({ statement: required(280, "문장을 입력해 주세요.") });
export type SetPurposeInput = z.infer<typeof setPurposeSchema>;

export const createIdentitySchema = z.object({ name: required(40, "이름을 입력해 주세요."), description: optionalText(280) });
export type CreateIdentityInput = z.infer<typeof createIdentitySchema>;
export const updateIdentitySchema = createIdentitySchema.extend({
  identityId: z.uuid(),
  status: z.enum(ARCHIVABLE_STATUSES),
  sortOrder,
});
export type UpdateIdentityInput = z.infer<typeof updateIdentitySchema>;

export const createMissionSchema = z.object({
  title: required(120, "이름을 입력해 주세요."),
  outcome: optionalText(500),
  deadline: localDate.nullable().optional(),
  identityIds: z.array(z.uuid()).max(6).default([]),
});
export type CreateMissionInput = z.infer<typeof createMissionSchema>;
export const updateMissionSchema = z.object({
  missionId: z.uuid(),
  title: required(120, "이름을 입력해 주세요."),
  outcome: optionalText(500),
  deadline: localDate.nullable(),
  identityIds: z.array(z.uuid()).max(6),
  status: z.enum(MISSION_STATUSES),
});
export type UpdateMissionInput = z.infer<typeof updateMissionSchema>;

export const upsertCriterionSchema = z
  .object({
    missionId: z.uuid(),
    criterionId: z.uuid().optional(),
    label: required(120),
    kind: z.enum(CRITERION_KINDS),
    targetValue: z.coerce.number().positive().max(1e9).nullable(),
    unit: optionalText(12),
  })
  .refine((v) => (v.kind === "check" ? v.targetValue === null : v.targetValue !== null), {
    message: "숫자 기준에는 목표값이 필요합니다.",
    path: ["targetValue"],
  });
export type UpsertCriterionInput = z.infer<typeof upsertCriterionSchema>;
export const criterionIdSchema = z.object({ criterionId: z.uuid() });
export const setCriterionProgressSchema = z
  .object({
    criterionId: z.uuid(),
    met: z.boolean().optional(),
    currentValue: z.coerce.number().min(0).max(1e9).optional(),
  })
  .refine((v) => (v.met === undefined) !== (v.currentValue === undefined), { message: "하나만 지정해 주세요." });
export type SetCriterionProgressInput = z.infer<typeof setCriterionProgressSchema>;

export const switchPathSchema = z.object({
  missionId: z.uuid(),
  title: required(80, "이름을 입력해 주세요."),
  approach: required(1000, "접근 방식을 입력해 주세요."),
  tradeOffs: optionalText(1000),
});
export type SwitchPathInput = z.infer<typeof switchPathSchema>;
export const updatePathSchema = z.object({
  pathId: z.uuid(),
  title: required(80, "이름을 입력해 주세요."),
  approach: required(1000, "접근 방식을 입력해 주세요."),
  tradeOffs: optionalText(1000),
});
export type UpdatePathInput = z.infer<typeof updatePathSchema>;

const steps = z
  .array(z.string().trim().max(120))
  .transform((xs) => xs.filter((x) => x.length > 0))
  .pipe(z.array(z.string()).max(12, "단계는 12개까지입니다."));
export const createProtocolSchema = z.object({
  pathId: z.uuid(),
  title: required(80, "이름을 입력해 주세요."),
  steps,
  intendedMinutes: z.coerce.number().int().min(5).max(600).nullable(),
});
export type CreateProtocolInput = z.infer<typeof createProtocolSchema>;
export const updateProtocolSchema = z.object({
  protocolId: z.uuid(),
  title: required(80, "이름을 입력해 주세요."),
  steps,
  intendedMinutes: z.coerce.number().int().min(5).max(600).nullable(),
  status: z.enum(ARCHIVABLE_STATUSES),
  sortOrder,
});
export type UpdateProtocolInput = z.infer<typeof updateProtocolSchema>;

const weekdays = z
  .array(z.coerce.number().int().min(1).max(7))
  .min(1, "요일을 하나 이상 고르세요.")
  .transform((d) => [...new Set(d)].sort((a, b) => a - b));
const habitFields = z.object({
  title: required(80, "이름을 입력해 주세요."),
  rule: z.enum(HABIT_RULES),
  targetMinutes: z.coerce.number().int().min(5).max(600).nullable(),
  weekdays,
  protocolId: z.uuid().nullable(),
});
const habitRule = (v: { rule: HabitRule; targetMinutes: number | null; protocolId: string | null }) =>
  v.rule === "check" ? v.targetMinutes === null : v.targetMinutes !== null && v.protocolId !== null;
const habitRuleError = { message: "집중 시간 규칙에는 실행 방식과 목표 시간이 필요합니다.", path: ["rule"] };
export const createHabitSchema = habitFields.refine(habitRule, habitRuleError);
export type CreateHabitInput = z.infer<typeof createHabitSchema>;
export const updateHabitSchema = habitFields
  .extend({ habitId: z.uuid(), status: z.enum(ARCHIVABLE_STATUSES), sortOrder })
  .refine(habitRule, habitRuleError);
export type UpdateHabitInput = z.infer<typeof updateHabitSchema>;
export const setHabitCheckSchema = z.object({ habitId: z.uuid(), done: z.boolean() });
export type SetHabitCheckInput = z.infer<typeof setHabitCheckSchema>;
