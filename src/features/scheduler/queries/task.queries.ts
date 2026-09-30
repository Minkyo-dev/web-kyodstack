import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { fromDbError } from "@/lib/errors";
import type { Task, TaskTemplate } from "../domain/task.types";
import { normalizeTask, TASK_SELECT } from "./select";

/**
 * Today list: open tasks due today, overdue, or undated, plus tasks
 * completed today (so progress stays visible until the day ends).
 */
export async function listTodayTasks(
  supabase: SupabaseServerClient,
  today: string,
  todayStartIso: string,
): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .neq("status", "cancelled")
    .or(`target_date.is.null,target_date.lte.${today}`)
    .or(`status.in.(inbox,planned,in_progress),completed_at.gte.${todayStartIso}`)
    .order("status", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw fromDbError(error);
  return sortForToday((data ?? []).map((r) => normalizeTask(r)) as unknown as Task[]);
}

/** Open work first, completed last. */
function sortForToday(tasks: Task[]): Task[] {
  const rank = (t: Task) => (t.status === "completed" ? 1 : 0);
  return [...tasks].sort((a, b) => rank(a) - rank(b));
}

export async function listTemplates(supabase: SupabaseServerClient): Promise<TaskTemplate[]> {
  const { data, error } = await supabase
    .from("task_templates")
    .select("id, name, category, default_estimate_minutes")
    .eq("active", true)
    .order("name");
  if (error) throw fromDbError(error);
  return data;
}

/** Tasks completed in [startIso, endIso) — the week summary count (D3 spec §2). */
export async function countCompletedInRange(
  supabase: SupabaseServerClient,
  startIso: string,
  endIso: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("status", "completed")
    .gte("completed_at", startIso)
    .lt("completed_at", endIso);
  if (error) throw fromDbError(error);
  return count ?? 0;
}
