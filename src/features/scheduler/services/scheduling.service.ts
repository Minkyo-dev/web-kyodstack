import "server-only";
import { addMinutes } from "date-fns";
import type { ActionContext } from "@/lib/action";
import { log } from "@/lib/logger";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { AppError, fromDbError } from "@/lib/errors";
import type { ScheduleBlock } from "../domain/schedule.types";
import { getSchedulerContext } from "../queries/schedule.queries";
import type {
  CreateTaskInRangeInput,
  MoveBlockInput,
  RescheduleBlockInput,
  ScheduleTaskInput,
  SetBlockStatusInput,
  UpdateSchedulerSettingsInput,
} from "../schemas/schedule.schema";
import { minutesBetween } from "../utils/duration";
import { toLocalDate } from "../utils/timezone";
import { estimateDuration } from "../utils/estimator";
import { groupLabels } from "@/features/classification/utils/labels";
import { listDomainRefs } from "@/features/classification/queries/classification.queries";
import { loadDurationGroups } from "./duration-groups.service";
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
    const [groups, domains] = await Promise.all([
      loadDurationGroups(ctx.supabase, ctx.user.id),
      listDomainRefs(ctx.supabase, ctx.user.id),
    ]);
    const rec = estimateDuration(task, settings, groups, groupLabels(domains));
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
  const { task } = await createTask(ctx, {
    title: input.title,
    userEstimatedMinutes: Math.round(minutesBetween(input.startsAt, input.endsAt)),
    targetDate: toLocalDate(input.startsAt, timezone),
  });
  return scheduleTask(ctx, { taskId: task.id, startsAt: input.startsAt, endsAt: input.endsAt });
}

/**
 * Mark ended planned blocks without a session as missed (calendar-planning design §1).
 * Called before the page reads blocks and by the nightly job. Best-effort: never fails the caller.
 */
export async function markMissedBlocks(supabase: SupabaseServerClient, userId: string): Promise<number> {
  const { data, error } = await supabase.rpc("mark_missed_blocks", { p_user_id: userId });
  if (error) {
    log({ action: "schedule.mark_missed", userId, success: false, errorCode: "DATABASE_ERROR", detail: error.message });
    return 0;
  }
  return data ?? 0;
}

/**
 * Before the block ends: move it (the revision records the reschedule).
 * After it ends (missed, or not marked yet): a new block with the same length; the old one stays as history.
 */
export async function rescheduleBlock(ctx: ActionContext, input: RescheduleBlockInput): Promise<ScheduleBlock> {
  const { data: block, error } = await ctx.supabase
    .from("schedule_blocks")
    .select("id, task_id, starts_at, ends_at, status")
    .eq("id", input.blockId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!block) throw new AppError("NOT_FOUND");
  if (block.status !== "planned" && block.status !== "missed") {
    throw new AppError("CONFLICT", "이 일정은 다시 잡을 수 없습니다.");
  }
  const lengthMs = new Date(block.ends_at).getTime() - new Date(block.starts_at).getTime();
  const endsAt = new Date(new Date(input.startsAt).getTime() + lengthMs).toISOString();
  const ended = new Date(block.ends_at).getTime() <= Date.now();
  if (block.status === "planned" && !ended) {
    return moveBlock(ctx, { blockId: block.id, startsAt: input.startsAt, endsAt });
  }
  return scheduleTask(ctx, { taskId: block.task_id, startsAt: input.startsAt, endsAt });
}

export async function unscheduleBlock(ctx: ActionContext, blockId: string): Promise<ScheduleBlock> {
  const { data, error } = await ctx.supabase.rpc("unschedule_block", { p_block_id: blockId }).single();
  if (error) {
    if (error.code === "23514") throw new AppError("CONFLICT", "이미 처리된 일정입니다.");
    throw fromDbError(error);
  }
  return data as ScheduleBlock;
}

export async function updateSchedulerSettings(
  ctx: ActionContext,
  input: UpdateSchedulerSettingsInput,
): Promise<void> {
  const { error } = await ctx.supabase
    .from("scheduler_settings")
    .update({ show_actual_default: input.showActualDefault })
    .eq("user_id", ctx.user.id);
  if (error) throw fromDbError(error);
}
