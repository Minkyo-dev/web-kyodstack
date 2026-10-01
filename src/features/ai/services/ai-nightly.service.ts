import "server-only";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { getSchedulerContext } from "@/features/scheduler/queries/schedule.queries";
import { addLocalDays, localDayRange, todayLocalDate } from "@/features/scheduler/utils/timezone";
import { classifyTasks } from "./classification.service";
import { getAiProvider } from "./provider";
import { interpretWorkLog } from "./worklog.service";

const BATCH = 20;
const CATCH_UP = 5;

/**
 * Nightly AI work (F1 spec §2, §3): one classification batch and an interpretation catch-up per user.
 * Every query filters user_id (service role). A missing provider or the daily cap stops quietly.
 */
export async function runAiNightly(ctx: ActionContext): Promise<{ classified: number; interpreted: number }> {
  const uid = ctx.user.id;
  try {
    await getAiProvider();
  } catch {
    return { classified: 0, interpreted: 0 };
  }

  let classified = 0;
  try {
    const [open, proposed] = await Promise.all([
      ctx.supabase
        .from("tasks")
        .select("id")
        .eq("user_id", uid)
        .not("status", "in", "(completed,cancelled)")
        .or("task_type.is.null,practice_domain_id.is.null")
        .order("created_at")
        .limit(200),
      ctx.supabase.from("task_features").select("task_id").eq("user_id", uid).eq("status", "proposed"),
    ]);
    if (open.error) throw fromDbError(open.error);
    if (proposed.error) throw fromDbError(proposed.error);
    const busy = new Set(proposed.data.map((r) => r.task_id));
    const ids = open.data.map((t) => t.id).filter((id) => !busy.has(id)).slice(0, BATCH);
    if (ids.length) classified = await classifyTasks(ctx, ids);
  } catch (error) {
    log({ action: "ai.nightly.classify", userId: uid, success: false, errorCode: error instanceof AppError ? error.code : "INTERNAL_ERROR" });
  }

  let interpreted = 0;
  const { timezone } = await getSchedulerContext(ctx.supabase, uid);
  const since = localDayRange(addLocalDays(todayLocalDate(timezone), -1, timezone), timezone).start;
  const { data: logs, error } = await ctx.supabase
    .from("work_logs")
    .select("session_id, note, session:work_sessions!work_logs_session_id_user_id_fkey(ended_at)")
    .eq("user_id", uid)
    .is("ai_interpretation", null)
    .not("note", "is", null)
    .not("session_id", "is", null)
    .limit(200);
  if (error) throw fromDbError(error);
  const due = logs
    .filter((l) => (l.note ?? "").trim().length >= 20)
    .filter((l) => {
      const s = Array.isArray(l.session) ? l.session[0] : l.session;
      return !!s?.ended_at && s.ended_at >= since;
    })
    .slice(0, CATCH_UP);
  for (const l of due) if (await interpretWorkLog(ctx, l.session_id!)) interpreted++;
  return { classified, interpreted };
}
