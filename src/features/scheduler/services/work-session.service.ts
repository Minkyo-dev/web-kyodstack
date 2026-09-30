import "server-only";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import { MAX_SESSION_MINUTES, type WorkSession } from "../domain/work-session.types";
import type {
  ManualWorkSessionInput,
  StartWorkSessionInput,
  StopWorkSessionInput,
} from "../schemas/work-session.schema";
import { minutesBetween } from "../utils/duration";

const CLOCK_SKEW_MS = 60_000;

function assertSessionRange(startedAt: string, endedAt: string) {
  const minutes = minutesBetween(startedAt, endedAt);
  if (!(minutes > 0)) throw new AppError("INVALID_TIME_RANGE");
  if (minutes > MAX_SESSION_MINUTES) {
    throw new AppError("INVALID_TIME_RANGE", "한 번의 작업 기록은 16시간을 넘을 수 없습니다.");
  }
  if (new Date(endedAt).getTime() > Date.now() + CLOCK_SKEW_MS) {
    throw new AppError("INVALID_TIME_RANGE", "미래 시간은 기록할 수 없습니다.");
  }
}

/** Timer start (spec §24). Atomic in the DB; one running timer per user. */
export async function startWorkSession(
  ctx: ActionContext,
  input: StartWorkSessionInput,
): Promise<WorkSession> {
  const { data, error } = await ctx.supabase
    .rpc("start_work_session", { p_task_id: input.taskId ?? null, p_block_id: input.blockId })
    .single();
  if (error) {
    if (error.code === "23505") throw new AppError("ACTIVE_TIMER_EXISTS");
    if (error.code === "23514") {
      throw new AppError("CONFLICT", "완료되었거나 취소된 작업은 시작할 수 없습니다.");
    }
    throw fromDbError(error);
  }
  return data as WorkSession;
}

export async function stopWorkSession(
  ctx: ActionContext,
  input: StopWorkSessionInput,
): Promise<WorkSession> {
  const running = await ctx.supabase
    .from("work_sessions")
    .select("id, started_at")
    .eq("id", input.sessionId)
    .eq("user_id", ctx.user.id)
    .is("ended_at", null)
    .maybeSingle();
  if (running.error) throw fromDbError(running.error);
  if (!running.data) throw new AppError("CONFLICT", "이미 종료된 타이머입니다.");

  const endedAt = input.endedAt ?? new Date().toISOString();
  assertSessionRange(running.data.started_at, endedAt);

  const { data, error } = await ctx.supabase
    .from("work_sessions")
    .update({
      ended_at: endedAt,
      focus_score: input.focusScore ?? null,
      mood_score: input.moodScore ?? null,
      energy_score: input.energyScore ?? null,
      note: input.note || null,
    })
    .eq("id", input.sessionId)
    .eq("user_id", ctx.user.id)
    .is("ended_at", null) // a concurrent stop wins exactly once
    .select()
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new AppError("CONFLICT", "이미 종료된 타이머입니다.");
  return data as WorkSession;
}

/**
 * Manual entry (spec §4.1 #10). Rejects overlap with the user's other sessions,
 * including the running one, so actual time is never double-counted.
 */
export async function createManualWorkSession(
  ctx: ActionContext,
  input: ManualWorkSessionInput,
): Promise<WorkSession> {
  assertSessionRange(input.startedAt, input.endedAt);

  const overlap = await ctx.supabase
    .from("work_sessions")
    .select("id, started_at, ended_at")
    .eq("user_id", ctx.user.id)
    .lt("started_at", input.endedAt)
    .or(`ended_at.gt.${input.startedAt},ended_at.is.null`)
    .limit(1);
  if (overlap.error) throw fromDbError(overlap.error);
  if (overlap.data.length > 0) {
    throw new AppError("CONFLICT", "같은 시간대에 이미 작업 기록이 있습니다.");
  }

  const { data, error } = await ctx.supabase
    .from("work_sessions")
    .insert({
      user_id: ctx.user.id,
      task_id: input.taskId, // composite FK guarantees the task is the caller's
      started_at: input.startedAt,
      ended_at: input.endedAt,
      source: "manual",
      focus_score: input.focusScore ?? null,
      mood_score: input.moodScore ?? null,
      energy_score: input.energyScore ?? null,
      note: input.note || null,
    })
    .select()
    .single();
  if (error) throw fromDbError(error);
  return data as WorkSession;
}

export async function deleteWorkSession(ctx: ActionContext, sessionId: string): Promise<void> {
  const { data, error } = await ctx.supabase
    .from("work_sessions")
    .delete()
    .eq("id", sessionId)
    .eq("user_id", ctx.user.id)
    .select("id");
  if (error) throw fromDbError(error);
  if (!data?.length) throw new AppError("NOT_FOUND");
}
