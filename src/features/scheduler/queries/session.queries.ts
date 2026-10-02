import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { fromDbError } from "@/lib/errors";
import type {
  DailyReflection,
  SessionWithTask,
} from "../domain/work-session.types";

const SESSION_SELECT =
  "*, task:tasks!work_sessions_task_id_user_id_fkey(id, title), pauses:work_session_pauses!work_session_pauses_session_id_user_id_fkey(id, paused_at, resumed_at, reason), work_log:work_logs!work_logs_session_id_user_id_fkey(id, focus_score, mood_score, energy_score, note, ai_interpretation, confirmed_blocker)";

type SessionRow = Omit<SessionWithTask, "work_log" | "pauses"> & {
  pauses: SessionWithTask["pauses"] | null;
  work_log: SessionWithTask["work_log"] | SessionWithTask["work_log"][];
};

/** PostgREST may return the 0..1 work log as an array; pauses come in any order. */
function normalize(row: SessionRow): SessionWithTask {
  const log = Array.isArray(row.work_log) ? (row.work_log[0] ?? null) : row.work_log;
  const pauses = [...(row.pauses ?? [])].sort((a, b) => a.paused_at.localeCompare(b.paused_at));
  return { ...row, pauses, work_log: log };
}

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
  return (data as unknown as SessionRow[]).map(normalize);
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
  return data ? normalize(data as unknown as SessionRow) : null;
}

export async function getDailyReflection(
  supabase: SupabaseServerClient,
  date: string,
): Promise<DailyReflection | null> {
  const { data, error } = await supabase
    .from("daily_reflections")
    .select("reflection_date, mood_score, focus_score, energy_score, note, win, blocker, next_task_id")
    .eq("reflection_date", date)
    .maybeSingle();
  if (error) throw fromDbError(error);
  return data;
}
