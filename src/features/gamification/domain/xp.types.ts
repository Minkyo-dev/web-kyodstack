import type { PauseLike, StatInput } from "@/features/analytics/domain/stats.types";

export const XP_RULES = ["focus", "completion", "commitment"] as const;
export type XpRule = (typeof XP_RULES)[number];
export const XP_RULE_LABEL: Record<XpRule, string> = { focus: "집중", completion: "완료", commitment: "약속 지킴" };

export type DayFacts = {
  date: string;
  sessions: { id: string; source: "timer" | "manual"; endedAt: string; focusedMinutes: number }[];
  completions: { taskId: string; completedAt: string; focusedMinutes: number }[];
  commitments: { blockId: string; resolvedAt: string; score: number }[];
};
export type ExistingXp = { rule: XpRule; sourceId: string; xp: number };
export type NewXpEvent = {
  rule: XpRule;
  sourceType: "work_session" | "task" | "schedule_block";
  sourceId: string;
  localDate: string;
  xp: number;
  metadata: Record<string, number>;
};
export type XpRaw = {
  now: string;
  timezone: string;
  settings: StatInput["settings"];
  sessions: {
    id: string;
    task_id: string;
    schedule_block_id: string | null;
    source: string;
    started_at: string;
    ended_at: string | null;
    pauses: PauseLike[];
  }[];
  completedTasks: { id: string; completed_at: string }[];
  taskFocus: Record<string, number>;
  blocks: StatInput["blocks"];
  revisions: StatInput["revisions"];
};
