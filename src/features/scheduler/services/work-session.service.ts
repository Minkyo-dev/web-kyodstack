import "server-only";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import { MAX_SESSION_MINUTES, type SessionPause, type WorkSession } from "../domain/work-session.types";
import type {
  ManualWorkSessionInput,
  PauseWorkSessionInput,
  SaveWorkLogNoteInput,
  SetPauseReasonInput,
  StartWorkSessionInput,
  StopWorkSessionInput,
} from "../schemas/work-session.schema";
import { minutesBetween } from "../utils/duration";
import { sessionTooLong } from "../utils/focus";
import { refreshProfilesQuietly } from "./duration-profile.service";

/** Changing a completed task's actual time changes its learning sample. */
async function refreshIfCompleted(ctx: ActionContext, taskId: string) {
  const { data } = await ctx.supabase
    .from("tasks")
    .select("status, template_id")
    .eq("id", taskId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (data?.status === "completed") await refreshProfilesQuietly(ctx, [data.template_id]);
}

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

/** Map the focus functions' check_violation messages to user-facing errors. */
function fromSessionFnError(error: { code?: string; message?: string }): AppError {
  if (error.code === "23505") return new AppError("ACTIVE_TIMER_EXISTS");
  if (error.code === "23514") {
    if (error.message === "end before pause") {
      return new AppError("INVALID_TIME_RANGE", "종료 시각이 일시정지 기록보다 앞설 수 없습니다.");
    }
    if (error.message === "end before start") return new AppError("INVALID_TIME_RANGE");
    if (error.message === "task is closed") {
      return new AppError("CONFLICT", "완료되었거나 취소된 작업은 시작할 수 없습니다.");
    }
    return new AppError("CONFLICT", "타이머 상태가 바뀌었습니다. 새로고침 후 다시 시도해 주세요.");
  }
  return fromDbError(error as Parameters<typeof fromDbError>[0]);
}

/** Timer start (spec §24). Atomic in the DB; one running timer per user. */
export async function startWorkSession(
  ctx: ActionContext,
  input: StartWorkSessionInput,
): Promise<WorkSession> {
  const { data, error } = await ctx.supabase
    // The SQL param accepts null (start from a block); the generated type doesn't say so.
    .rpc("start_work_session", { p_task_id: (input.taskId ?? null) as string, p_block_id: input.blockId })
    .single();
  if (error) throw fromSessionFnError(error);
  return data as WorkSession;
}


/** Stop (and optionally complete the task) in one DB transaction; closes an open pause. */
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
    .rpc("stop_work_session", {
      p_session_id: input.sessionId,
      p_ended_at: endedAt,
      p_focus: input.focusScore ?? undefined,
      p_mood: input.moodScore ?? undefined,
      p_energy: input.energyScore ?? undefined,
      p_note: input.note || undefined,
      p_complete_task: input.completeTask ?? false,
    })
    .single();
  if (error) throw fromSessionFnError(error);
  // The generated type for this one-row RPC narrows to never; the row is a work_sessions row.
  const session = data as WorkSession;
  await refreshIfCompleted(ctx, session.task_id);
  return session;
}

export async function pauseWorkSession(ctx: ActionContext, input: PauseWorkSessionInput): Promise<SessionPause> {
  const { data, error } = await ctx.supabase
    .rpc("pause_work_session", { p_session_id: input.sessionId, p_reason: input.reason })
    .single();
  if (error) throw fromSessionFnError(error);
  return data as SessionPause;
}

export async function resumeWorkSession(ctx: ActionContext, sessionId: string): Promise<SessionPause> {
  const { data, error } = await ctx.supabase.rpc("resume_work_session", { p_session_id: sessionId }).single();
  if (error) throw fromSessionFnError(error);
  return data as SessionPause;
}

/** Optional reason chosen after pausing (requirements §12). */
export async function setPauseReason(ctx: ActionContext, input: SetPauseReasonInput): Promise<void> {
  const { data, error } = await ctx.supabase
    .from("work_session_pauses")
    .update({ reason: input.reason })
    .eq("id", input.pauseId)
    .eq("user_id", ctx.user.id)
    .select("id");
  if (error) throw fromDbError(error);
  if (!data?.length) throw new AppError("NOT_FOUND");
}

/** Note typed while the timer runs; upserts the session's work log (note only). */
export async function saveWorkLogNote(ctx: ActionContext, input: SaveWorkLogNoteInput): Promise<void> {
  const session = await ctx.supabase
    .from("work_sessions")
    .select("id, task_id")
    .eq("id", input.sessionId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (session.error) throw fromDbError(session.error);
  if (!session.data) throw new AppError("NOT_FOUND");
  const { error } = await ctx.supabase.from("work_logs").upsert(
    {
      user_id: ctx.user.id,
      task_id: session.data.task_id,
      session_id: session.data.id,
      note: input.note || null,
    },
    { onConflict: "session_id" },
  );
  if (error) throw fromDbError(error);
}

/** Hold the open session (no summary) and start another, atomically (focus-flow design §2). */
export async function switchWorkSession(
  ctx: ActionContext,
  input: StartWorkSessionInput,
): Promise<WorkSession> {
  const open = await ctx.supabase
    .from("work_sessions")
    .select("started_at")
    .eq("user_id", ctx.user.id)
    .is("ended_at", null)
    .maybeSingle();
  if (open.error) throw fromDbError(open.error);
  if (!open.data) throw new AppError("CONFLICT", "실행 중인 타이머가 없습니다.");
  if (sessionTooLong(open.data.started_at, new Date())) {
    throw new AppError(
      "INVALID_TIME_RANGE",
      "타이머가 16시간을 넘었습니다. 먼저 종료 시각을 고쳐서 마쳐 주세요.",
    );
  }
  const { data, error } = await ctx.supabase
    .rpc("switch_work_session", { p_task_id: input.taskId ?? undefined, p_block_id: input.blockId ?? undefined })
    .single();
  if (error) throw fromSessionFnError(error);
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
    })
    .select()
    .single();
  if (error) throw fromDbError(error);
  if (
    input.focusScore != null || input.moodScore != null || input.energyScore != null || input.note
  ) {
    const log = await ctx.supabase.from("work_logs").insert({
      user_id: ctx.user.id,
      task_id: input.taskId,
      session_id: data.id,
      focus_score: input.focusScore ?? null,
      mood_score: input.moodScore ?? null,
      energy_score: input.energyScore ?? null,
      note: input.note || null,
    });
    if (log.error) {
      await ctx.supabase.from("work_sessions").delete().eq("id", data.id).eq("user_id", ctx.user.id);
      throw fromDbError(log.error);
    }
  }
  await refreshIfCompleted(ctx, input.taskId);
  return data as WorkSession;
}

export async function deleteWorkSession(ctx: ActionContext, sessionId: string): Promise<void> {
  const { data, error } = await ctx.supabase
    .from("work_sessions")
    .delete()
    .eq("id", sessionId)
    .eq("user_id", ctx.user.id)
    .select("id, task_id");
  if (error) throw fromDbError(error);
  if (!data?.length) throw new AppError("NOT_FOUND");
  await refreshIfCompleted(ctx, data[0].task_id);
}
