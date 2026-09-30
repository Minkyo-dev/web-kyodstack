import type { Tables } from "@/types/database";
import type { TaskStatus } from "./scheduler.constants";

export type TaskRow = Tables<"tasks">;
export type TaskTemplate = Pick<
  Tables<"task_templates">,
  "id" | "name" | "category" | "default_estimate_minutes"
>;

/** Task as the scheduler UI sees it. */
export type Task = Omit<TaskRow, "status"> & {
  status: TaskStatus;
  template: Pick<TaskTemplate, "id" | "name" | "default_estimate_minutes"> | null;
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
>;

export type SchedulerContext = {
  timezone: string;
  settings: SchedulerSettings;
};
