import type { Tables } from "@/types/database";
import type { TaskStatus } from "./scheduler.constants";
import type { TagRef, TaskType } from "@/features/classification/domain/classification.types";

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
  project: { id: string; name: string } | null;
  milestone: { id: string; name: string } | null;
  domain: { id: string; name: string } | null;
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
>;

export type SchedulerContext = {
  timezone: string;
  settings: SchedulerSettings;
};
