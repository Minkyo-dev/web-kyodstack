import "server-only";
import { fromDbError } from "@/lib/errors";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { focusStats } from "@/features/scheduler/utils/focus";
import { addLocalDays, localDayRange, toLocalDate } from "@/features/scheduler/utils/timezone";
import { loadDirectionStatus } from "@/features/direction/queries/status.queries";
import { COACH_KINDS, COACH_WINDOW_DAYS, DISMISS_QUIET_DAYS, type CoachInput } from "../domain/coach";

const PAUSES = "pauses:work_session_pauses!work_session_pauses_session_id_user_id_fkey(paused_at, resumed_at)";
const LIMIT = 5000;

/** Inputs of `coach-v1` over the last 28 local days (today excluded). Explicit user_id filters throughout. */
export async function loadCoachInput(
  supabase: SupabaseServerClient,
  userId: string,
  today: string,
  timezone: string,
  now: Date,
): Promise<CoachInput> {
  const windowStart = addLocalDays(today, -COACH_WINDOW_DAYS, timezone);
  const from = localDayRange(windowStart, timezone).start;
  const to = localDayRange(today, timezone).start;
  const quietSince = new Date(now.getTime() - DISMISS_QUIET_DAYS * 86_400_000).toISOString();
  const [protocols, sessions, habits, checks, dismissed, status] = await Promise.all([
    supabase
      .from("protocols")
      .select("id, title, intended_minutes, status, path:paths!protocols_path_id_mission_id_fkey(status)")
      .eq("user_id", userId)
      .eq("status", "active"),
    supabase
      .from("work_sessions")
      .select(`started_at, ended_at, source, ${PAUSES}, task:tasks!work_sessions_task_id_user_id_fkey(protocol_id)`)
      .eq("user_id", userId)
      .eq("source", "timer")
      .gte("ended_at", from)
      .lt("ended_at", to)
      .limit(LIMIT),
    supabase.from("habits").select("id, title, weekdays, created_at, rule, target_minutes, protocol_id").eq("user_id", userId).eq("status", "active"),
    supabase.from("habit_checks").select("habit_id, local_date").eq("user_id", userId).gte("local_date", windowStart).lt("local_date", today),
    supabase.from("assistant_proposals").select("kind, target_key").eq("user_id", userId).eq("status", "dismissed").gte("decided_at", quietSince),
    loadDirectionStatus(supabase, userId, now),
  ]);
  for (const r of [protocols, sessions, habits, checks, dismissed]) if (r.error) throw fromDbError(r.error);

  const minutesByProtocol = new Map<string, number[]>();
  for (const s of sessions.data!) {
    const pid = s.task?.protocol_id;
    if (!pid || !s.ended_at) continue;
    const m = focusStats(s, s.pauses ?? []).focusedMs / 60_000;
    minutesByProtocol.set(pid, [...(minutesByProtocol.get(pid) ?? []), m]);
  }
  return {
    windowStart,
    windowEnd: today,
    protocols: protocols
      .data!.filter((p) => p.path?.status === "active")
      .map((p) => ({
        id: p.id,
        title: p.title,
        intendedMinutes: p.intended_minutes,
        sessionMinutes: minutesByProtocol.get(p.id) ?? [],
        focusHabits: habits
          .data!.filter((h) => h.protocol_id === p.id && h.rule === "focus" && h.target_minutes)
          .map((h) => ({ id: h.id, targetMinutes: h.target_minutes! })),
      })),
    habits: habits.data!.map((h) => ({
      id: h.id,
      title: h.title,
      weekdays: h.weekdays,
      createdDate: toLocalDate(h.created_at, timezone),
      checkedDates: checks.data!.filter((c) => c.habit_id === h.id).map((c) => c.local_date),
    })),
    signals: status.missions.flatMap((m) => m.diagnosis.signals.map((s) => ({ missionId: m.id, missionTitle: m.title, layer: s.layer, evidence: s.evidence }))),
    quiet: new Set(dismissed.data!.map((d) => `${d.kind}:${d.target_key}`)),
  };
}

export type ProposalRow = {
  id: string;
  week_start: string;
  kind: string;
  title: string;
  reason: string;
  payload: unknown;
  evidence: unknown;
  focus: boolean;
  status: string;
  decided_at: string | null;
};

/** The week's coaching proposals; chat proposals (create_task) live in the chat panel (ADR 0042). */
export async function listWeekProposals(supabase: SupabaseServerClient, userId: string, weekStart: string): Promise<ProposalRow[]> {
  const { data, error } = await supabase
    .from("assistant_proposals")
    .select("id, week_start, kind, title, reason, payload, evidence, focus, status, decided_at")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .in("kind", [...COACH_KINDS])
    .order("focus", { ascending: false })
    .order("created_at");
  if (error) throw fromDbError(error);
  return data;
}

/** The open focus proposal of a week, for the scheduler brief. */
export async function getOpenFocus(supabase: SupabaseServerClient, userId: string, weekStart: string) {
  const { data, error } = await supabase
    .from("assistant_proposals")
    .select("title")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .eq("focus", true)
    .eq("status", "proposed")
    .maybeSingle();
  if (error) throw fromDbError(error);
  return data;
}
