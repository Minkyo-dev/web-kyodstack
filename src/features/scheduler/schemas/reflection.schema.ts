import { z } from "zod";
import { isLocalDateString } from "../utils/timezone";

const score = z.coerce.number().int().min(1).max(5).nullable();

/** Evening check-in (ADR 0039): what blocked the day most. */
export const BLOCKERS = ["time", "energy", "interruption", "overplanned", "unclear", "none"] as const;
export type Blocker = (typeof BLOCKERS)[number];
export const BLOCKER_LABEL: Record<Blocker, string> = {
  time: "시간 부족",
  energy: "에너지",
  interruption: "방해·급한 일",
  overplanned: "계획 과다",
  unclear: "다음 행동이 불분명",
  none: "없음",
};

export const upsertReflectionSchema = z.object({
  reflectionDate: z.string().refine(isLocalDateString, "날짜 형식이 올바르지 않습니다."),
  moodScore: score,
  focusScore: score,
  energyScore: score,
  note: z.string().trim().max(5000).nullable(),
  win: z.string().trim().max(280).nullable().default(null),
  blocker: z.enum(BLOCKERS).nullable().default(null),
  nextTaskId: z.uuid().nullable().default(null),
});
export type UpsertReflectionInput = z.infer<typeof upsertReflectionSchema>;
