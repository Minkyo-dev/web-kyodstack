import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { fromDbError } from "@/lib/errors";
import type {
  DailyReflection,
  SessionWithTask,
} from "../domain/work-session.types";

const SESSION_SELECT = "*, task:tasks!work_sessions_task_id_user_id_fkey(id, title)";

/** Sessions overlapping [startIso, endIso), including a running one. Bounded (spec §50). */
export async function listSessionsInRange(
  supabase: SupabaseServerClient,
  startIso: string,
  endIso: string,
): Promise<SessionWithTask[]> {
  const { data, error } = await supabase
    .from("work_sessions")
    .select(SESSION_SELECT)
    .lt("started_at", endIso)
    .or(`ended_at.gt.${startIso},ended_at.is.null`)
    .order("started_at");
  if (error) throw fromDbError(error);
  return data as unknown as SessionWithTask[];
}

export async function getActiveSession(
  supabase: SupabaseServerClient,
): Promise<SessionWithTask | null> {
  const { data, error } = await supabase
    .from("work_sessions")
    .select(SESSION_SELECT)
    .is("ended_at", null)
    .maybeSingle();
  if (error) throw fromDbError(error);
  return data as unknown as SessionWithTask | null;
}

export async function getDailyReflection(
  supabase: SupabaseServerClient,
  date: string,
): Promise<DailyReflection | null> {
  const { data, error } = await supabase
    .from("daily_reflections")
    .select("reflection_date, mood_score, focus_score, energy_score, note")
    .eq("reflection_date", date)
    .maybeSingle();
  if (error) throw fromDbError(error);
  return data;
}
