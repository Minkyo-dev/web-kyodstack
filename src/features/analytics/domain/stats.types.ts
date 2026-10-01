import type { TaskType } from "@/features/classification/domain/classification.types";

export const STATS_VERSION = "stats-v2";
/** Calibration weight of a completed task with a user-confirmed external blocker (F1, ADR 0018). */
export const BLOCKER_WEIGHT = 0.3;
export const STAT_MIN = { calibration: 8, calibrationByType: 5, reliability: 10, consistency: 15, recovery: 5 } as const;
export const STAT_TYPES = ["calibration", "reliability", "consistency", "recovery"] as const;
export type StatType = (typeof STAT_TYPES)[number];
export const STAT_LABEL: Record<StatType, { name: string; meaning: string }> = {
  calibration: { name: "예상 정확도", meaning: "작업 시간을 얼마나 정확히 예상하는지" },
  reliability: { name: "계획 이행", meaning: "미리 잡은 일정을 얼마나 지키는지" },
  consistency: { name: "꾸준함", meaning: "근무일마다 의미 있게 일했는지" },
  recovery: { name: "회복력", meaning: "놓친 뒤 얼마나 빨리 다시 시작하는지" },
};

export type PauseLike = { paused_at: string; resumed_at: string | null };
export type StatInput = {
  now: string;
  timezone: string;
  settings: { planned_work_days: number[]; min_meaningful_minutes: number; commit_lead_minutes: number };
  firstActivityDate: string | null;
  blocks: { id: string; task_id: string; starts_at: string; ends_at: string; status: string; created_at: string; updated_at: string }[];
  revisions: { block_id: string; change_type: string; previous_starts_at: string | null; new_starts_at: string | null; created_at: string }[];
  sessions: {
    id: string;
    task_id: string;
    schedule_block_id: string | null;
    started_at: string;
    ended_at: string | null;
    pauses: PauseLike[];
    focus_score: number | null;
  }[];
  tasks: { id: string; status: string; task_type: string | null; practice_domain_id: string | null }[];
  calibration: {
    task_id: string;
    task_type: string | null;
    completed_at: string;
    estimate: number | null;
    firstSessionStart: string | null;
    actualMinutes: number;
    planBlocks: { starts_at: string; ends_at: string; status: string; created_at: string }[];
    /** A work log of this task has confirmed_blocker = true (F1). */
    blocker?: boolean;
  }[];
  domains: { id: string; name: string; parent_id: string | null }[];
  domainTotals: Record<string, number>;
};

export type StatValue = { value: number | null; sampleCount: number; need: number };
export type Stats = {
  version: typeof STATS_VERSION;
  calibration: StatValue & {
    bias: number | null;
    typicalError: number | null;
    /** Samples weighted down by a confirmed blocker. */
    blockerCount: number;
    byType: Partial<Record<TaskType, StatValue & { bias: number | null }>>;
  };
  reliability: StatValue;
  consistency: StatValue & { successDays: number; workDays: number };
  recovery: StatValue;
  patterns: {
    medianSessionMinutes: number | null;
    pauseRatio: number | null;
    averageFocus: number | null;
    dailyCapacityMinutes: number | null;
    reliableWindow: { start: string; end: string } | null;
    rescheduleWindow: { start: string; end: string } | null;
  };
  domains: { id: string; name: string; parentId: string | null; recentMinutes: number; totalMinutes: number }[];
};
