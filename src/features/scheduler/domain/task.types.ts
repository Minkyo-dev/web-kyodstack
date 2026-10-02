import type { Tables } from "@/types/database";
import type { TaskStatus } from "./scheduler.constants";
import type { TagRef, TaskType } from "@/features/classification/domain/classification.types";
import type { DirectionRef } from "@/features/direction/domain/direction.types";

export type TaskRow = Tables<"tasks">;
export type TaskTemplate = Pick<
  Tables<"task_templates">,
  "id" | "name" | "category" | "default_estimate_minutes"
>;

/** Task as the scheduler UI sees it. */
export type Task = Omit<TaskRow, "status" | "task_type"> & {
  status: TaskStatus;
  task_type: TaskType | null;
  template: Pick<TaskTemplate, "id" | "name" | "default_estimate_minutes"> | null;
  /** The project's mission makes a project-linked task Growth (ADR 0020). Optional for older fixtures. */
  project: { id: string; name: string; mission?: DirectionRef | null } | null;
  milestone: { id: string; name: string } | null;
  domain: { id: string; name: string } | null;
  mission?: DirectionRef | null;
  protocol?: { id: string; title: string; path: DirectionRef | null } | null;
  tags: TagRef[];
};

export type SchedulerSettings = Pick<
  Tables<"scheduler_settings">,
  | "week_starts_on"
  | "workday_start"
  | "workday_end"
  | "slot_minutes"
  | "min_block_minutes"
  | "max_focus_block_minutes"
  | "auto_schedule_mode"
  | "show_actual_default"
  | "planned_work_days"
  | "min_meaningful_minutes"
  | "commit_lead_minutes"
  | "insight_weekday"
  | "insight_hour"
  | "evening_hour"
>;

export type SchedulerContext = {
  timezone: string;
  settings: SchedulerSettings;
};
