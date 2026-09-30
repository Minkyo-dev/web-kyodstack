import type { Tables } from "@/types/database";

export const PROJECT_STATUSES = ["planned", "active", "paused", "completed", "cancelled"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const MILESTONE_STATUSES = ["planned", "in_progress", "completed", "cancelled"] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planned: "계획",
  active: "진행 중",
  paused: "보류",
  completed: "완료",
  cancelled: "취소",
};

export const MILESTONE_STATUS_LABEL: Record<MilestoneStatus, string> = {
  planned: "예정",
  in_progress: "진행 중",
  completed: "완료",
  cancelled: "취소",
};

export type Project = Omit<Tables<"projects">, "status"> & { status: ProjectStatus };
export type Milestone = Omit<Tables<"milestones">, "status"> & { status: MilestoneStatus };

/** Minimal shape for pickers (task drawer, quick add). */
export type ProjectOption = {
  id: string;
  name: string;
  milestones: { id: string; name: string }[];
};
