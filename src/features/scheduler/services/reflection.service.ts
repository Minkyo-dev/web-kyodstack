import "server-only";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import { OPEN_TASK_STATUSES } from "../domain/scheduler.constants";
import type { DailyReflection } from "../domain/work-session.types";
import type { UpsertReflectionInput } from "../schemas/reflection.schema";

/** One reflection per local day (unique user_id + reflection_date); re-saving updates it. */
export async function upsertDailyReflection(
  ctx: ActionContext,
  input: UpsertReflectionInput,
): Promise<DailyReflection> {
  // Tomorrow's one thing must be the user's own open task (ADR 0039; the composite FK backs this up).
  if (input.nextTaskId) {
    const task = await ctx.supabase.from("tasks").select("status").eq("id", input.nextTaskId).eq("user_id", ctx.user.id).maybeSingle();
    if (task.error) throw fromDbError(task.error);
    if (!task.data) throw new AppError("NOT_FOUND", "할 일을 찾을 수 없습니다.");
    if (!(OPEN_TASK_STATUSES as readonly string[]).includes(task.data.status)) throw new AppError("VALIDATION_ERROR", "끝나지 않은 할 일만 고를 수 있습니다.");
  }
  const { data, error } = await ctx.supabase
    .from("daily_reflections")
    .upsert(
      {
        user_id: ctx.user.id,
        reflection_date: input.reflectionDate,
        mood_score: input.moodScore,
        focus_score: input.focusScore,
        energy_score: input.energyScore,
        note: input.note || null,
        win: input.win || null,
        blocker: input.blocker,
        next_task_id: input.nextTaskId,
      },
      { onConflict: "user_id,reflection_date" },
    )
    .select("reflection_date, mood_score, focus_score, energy_score, note, win, blocker, next_task_id")
    .single();
  if (error) throw fromDbError(error);
  return data;
}
