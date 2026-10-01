import "server-only";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { WORKLOG_PROMPT_VERSION, WORKLOG_SYSTEM, worklogPrompt } from "../prompts/worklog.prompt";
import { WorklogOutputSchema } from "../schemas/worklog.schema";
import { sanitizeForPrompt } from "../utils/prompt-input";
import { callAi } from "./budget.service";

const MIN_NOTE = 20;

/** Interpret the session's work-log note once. Returns whether an interpretation was stored. Never throws. */
export async function interpretWorkLog(ctx: ActionContext, sessionId: string): Promise<boolean> {
  try {
    const { data: wl, error } = await ctx.supabase
      .from("work_logs")
      .select("id, task_id, note, ai_interpretation")
      .eq("user_id", ctx.user.id)
      .eq("session_id", sessionId)
      .maybeSingle();
    if (error) throw fromDbError(error);
    if (!wl || wl.ai_interpretation || (wl.note ?? "").trim().length < MIN_NOTE) return false;
    const { data: pa } = await ctx.supabase.from("task_plan_actual").select("user_estimated_minutes, actual_minutes").eq("user_id", ctx.user.id).eq("task_id", wl.task_id).maybeSingle();
    const estimate = pa?.user_estimated_minutes ?? null;
    const actual = Math.round(Number(pa?.actual_minutes ?? 0));
    const result = await callAi(ctx, "interpret_worklog", {
      task: "interpret_worklog",
      system: WORKLOG_SYSTEM,
      prompt: worklogPrompt({ note: sanitizeForPrompt(wl.note, 1000), estimateMinutes: estimate, actualMinutes: actual, ratio: estimate ? Math.round((actual / estimate) * 100) / 100 : null }),
      schema: WorklogOutputSchema,
      effort: "low",
    });
    const up = await ctx.supabase
      .from("work_logs")
      .update({ ai_interpretation: result.data, interpretation_model: result.model, interpretation_version: WORKLOG_PROMPT_VERSION })
      .eq("id", wl.id)
      .eq("user_id", ctx.user.id);
    if (up.error) throw fromDbError(up.error);
    return true;
  } catch (error) {
    log({ action: "ai.interpret_worklog", userId: ctx.user.id, success: false, errorCode: error instanceof AppError ? error.code : "INTERNAL_ERROR" });
    return false;
  }
}

export async function confirmBlocker(ctx: ActionContext, workLogId: string, confirmed: boolean): Promise<void> {
  const { data, error } = await ctx.supabase.from("work_logs").update({ confirmed_blocker: confirmed }).eq("id", workLogId).eq("user_id", ctx.user.id).select("id");
  if (error) throw fromDbError(error);
  if (!data.length) throw new AppError("NOT_FOUND");
}
