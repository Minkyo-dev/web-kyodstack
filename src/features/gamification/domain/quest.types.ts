import type { PauseLike } from "@/features/analytics/domain/stats.types";

export const QUEST_METRICS = [
  "focus_minutes", "complete_planned_tasks", "complete_tasks", "domain_minutes", "domain_sessions",
  "kept_commitments", "kept_commitment_rate", "days_within_capacity", "early_session", "booked_block", "started_session",
] as const;
export type QuestMetric = (typeof QUEST_METRICS)[number];
export type QuestType = "daily" | "weekly" | "recovery";
export const QUEST_META: Record<QuestType, { title: string; reward: number; label: string }> = {
  daily: { title: "모멘텀 쌓기", reward: 50, label: "SYSTEM QUEST" },
  weekly: { title: "모멘텀 유지", reward: 300, label: "WEEKLY QUEST" },
  recovery: { title: "다시 시작", reward: 40, label: "RECOVERY QUEST" },
};

export type ObjectiveParams = { taskIds?: string[]; domainId?: string; min?: number; before?: string; minMinutes?: number };
export type ObjectiveDraft = { metric: QuestMetric; params: ObjectiveParams; target: number };
export type QuestDraft = {
  type: QuestType;
  title: string;
  periodStart: string;
  periodEnd: string;
  rewardXp: number;
  objectives: ObjectiveDraft[];
  spare: ObjectiveDraft[];
};
export type DailyContext = {
  date: string;
  capacity: number | null;
  plannedMinutes: number;
  plannedTaskIds: string[];
  topDomainId: string | null;
  /** F2 AI picker inputs (optional for the rule quest). */
  topTask?: { id: string; title: string } | null;
  weakDomainId?: string | null;
  taskTitles?: string[];
  stats?: Record<string, number | null>;
};
export type WeeklyContext = { weekStart: string; weekEnd: string; capacity: number | null; plannedWorkDayCount: number; topDomainId: string | null };

export type QuestFacts = {
  timezone: string;
  now: string;
  plannedWorkDays: number[];
  capacity: number | null;
  sessions: { id: string; task_id: string; source: string; started_at: string; ended_at: string | null; pauses: PauseLike[] }[];
  tasks: Record<string, { status: string; completedAt: string | null; domainId: string | null }>;
  domainParent: Record<string, string | null>;
  commitments: { blockId: string; resolvedAt: string; score: number; kept: boolean }[];
  blocks: { id: string; created_at: string; starts_at: string; ends_at: string; status: string }[];
};
export type QuestWindow = { periodStart: string; periodEnd: string; createdAt: string };
