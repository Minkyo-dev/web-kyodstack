import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { fromDbError } from "@/lib/errors";
import type { TaskPlanActual } from "../domain/work-session.types";

/** Plan vs actual totals for the given tasks (view task_plan_actual, spec §21.2). */
export async function listTaskPlanActual(
  supabase: SupabaseServerClient,
  taskIds: string[],
): Promise<Record<string, TaskPlanActual>> {
  if (taskIds.length === 0) return {};
  const { data, error } = await supabase
    .from("task_plan_actual")
    .select(
      "task_id, planned_minutes, skipped_minutes, actual_minutes, session_count, average_focus, reschedule_count, paused_minutes",
    )
    .in("task_id", taskIds);
  if (error) throw fromDbError(error);
  const out: Record<string, TaskPlanActual> = {};
  for (const row of data) {
    if (!row.task_id) continue;
    out[row.task_id] = {
      task_id: row.task_id,
      planned_minutes: Number(row.planned_minutes ?? 0),
      skipped_minutes: Number(row.skipped_minutes ?? 0),
      actual_minutes: Number(row.actual_minutes ?? 0),
      paused_minutes: Number(row.paused_minutes ?? 0),
      session_count: row.session_count ?? 0,
      average_focus: row.average_focus === null ? null : Number(row.average_focus),
      reschedule_count: row.reschedule_count ?? 0,
    };
  }
  return out;
}
