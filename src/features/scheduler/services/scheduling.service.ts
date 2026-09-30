import "server-only";
import { addMinutes } from "date-fns";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import type { ScheduleBlock } from "../domain/schedule.types";
import { getSchedulerContext } from "../queries/schedule.queries";
import type {
  CreateTaskInRangeInput,
  MoveBlockInput,
  ScheduleTaskInput,
  SetBlockStatusInput,
} from "../schemas/schedule.schema";
import { minutesBetween } from "../utils/duration";
import { toLocalDate } from "../utils/timezone";
import { recommendDuration } from "./duration-estimator.service";
import { createTask, getTask } from "./task.service";

const MAX_BLOCK_MINUTES = 24 * 60;

function assertRange(startsAt: string, endsAt: string) {
  const minutes = minutesBetween(startsAt, endsAt);
  if (!(minutes > 0) || minutes > MAX_BLOCK_MINUTES) {
    throw new AppError("INVALID_TIME_RANGE");
  }
}

/** Task → calendar drop (spec §12, §27). Sizes the block unless an explicit end is given. */
export async function scheduleTask(
  ctx: ActionContext,
  input: ScheduleTaskInput,
): Promise<ScheduleBlock> {
  const task = await getTask(ctx, input.taskId);
  if (task.status === "completed" || task.status === "cancelled") {
    throw new AppError("CONFLICT", "완료되었거나 취소된 작업은 일정에 추가할 수 없습니다.");
  }

  let endsAt = input.endsAt;
  let source: "manual" | "duration_recommendation" = "manual";
  if (!endsAt) {
    const { settings } = await getSchedulerContext(ctx.supabase, ctx.user.id);
    const rec = await recommendDuration(task, settings);
    endsAt = addMinutes(new Date(input.startsAt), rec.minutes).toISOString();
    source = "duration_recommendation";
    if (task.recommended_minutes !== rec.minutes) {
      // Snapshot of the recommendation at scheduling time (spec §17.6).
      await ctx.supabase
        .from("tasks")
        .update({ recommended_minutes: rec.minutes })
        .eq("id", task.id)
        .eq("user_id", ctx.user.id);
    }
  }
  assertRange(input.startsAt, endsAt);

  const { data, error } = await ctx.supabase
    .rpc("create_schedule_block", {
      p_task_id: task.id,
      p_starts_at: input.startsAt,
      p_ends_at: endsAt,
      p_source: source,
    })
    .single();
  if (error) throw fromDbError(error);
  return data as ScheduleBlock;
}

/** Move and resize share one atomic DB function that also writes the revision (ADR 0004). */
export async function moveBlock(ctx: ActionContext, input: MoveBlockInput): Promise<ScheduleBlock> {
  assertRange(input.startsAt, input.endsAt);
  const { data, error } = await ctx.supabase
    .rpc("move_schedule_block", {
      p_block_id: input.blockId,
      p_starts_at: input.startsAt,
      p_ends_at: input.endsAt,
    })
    .single();
  if (error) throw fromDbError(error);
  return data as ScheduleBlock;
}

export async function setBlockStatus(
  ctx: ActionContext,
  input: SetBlockStatusInput,
): Promise<ScheduleBlock> {
  const { data, error } = await ctx.supabase
    .rpc("set_schedule_block_status", { p_block_id: input.blockId, p_status: input.status })
    .single();
  if (error) throw fromDbError(error);
  return data as ScheduleBlock;
}

/**
 * Click-drag an empty range: create the task, then its block with the exact range.
 * The spec has no transaction requirement here. If block creation fails, the task
 * stays in the Today list, which is harmless and visible.
 */
export async function createTaskInRange(
  ctx: ActionContext,
  input: CreateTaskInRangeInput,
): Promise<ScheduleBlock> {
  assertRange(input.startsAt, input.endsAt);
  const { timezone } = await getSchedulerContext(ctx.supabase, ctx.user.id);
  const task = await createTask(ctx, {
    title: input.title,
    userEstimatedMinutes: Math.round(minutesBetween(input.startsAt, input.endsAt)),
    targetDate: toLocalDate(input.startsAt, timezone),
  });
  return scheduleTask(ctx, { taskId: task.id, startsAt: input.startsAt, endsAt: input.endsAt });
}
