import type { Tables } from "@/types/database";
import type { BlockSource, BlockStatus } from "./scheduler.constants";
import type { Task } from "./task.types";

export type ScheduleBlockRow = Tables<"schedule_blocks">;

export type ScheduleBlock = Omit<ScheduleBlockRow, "status" | "source"> & {
  status: BlockStatus;
  source: BlockSource;
};

/** Block joined with its task, for rendering on the calendar and in the drawer. */
export type CalendarBlock = ScheduleBlock & { task: Task };
