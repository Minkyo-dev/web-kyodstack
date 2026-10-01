import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { fromDbError } from "@/lib/errors";
import { localDayRange } from "@/features/scheduler/utils/timezone";
import { focusMinutesFor, isDueOn } from "../domain/habits";
import type { Habit, HabitToday } from "../domain/direction.types";

const PAUSES = "pauses:work_session_pauses!work_session_pauses_session_id_user_id_fkey(paused_at, resumed_at)";

export type HabitListItem = Habit & { protocolTitle: string | null; missionTitle: string | null };

/** Finished sessions that ended on a local day, with the task's protocol (focus habits). */
export async function loadDaySessions(supabase: SupabaseServerClient, userId: string, date: string, timezone: string) {
  const { start, end } = localDayRange(date, timezone);
  const { data, error } = await supabase
    .from("work_sessions")
    .select(`source, started_at, ended_at, ${PAUSES}, task:tasks!work_sessions_task_id_user_id_fkey(protocol_id)`)
    .eq("user_id", userId)
    .gte("ended_at", start)
    .lt("ended_at", end)
    .limit(500);
  if (error) throw fromDbError(error);
  return data.map((s) => ({ ...s, pauses: s.pauses ?? [] }));
}

/** Every habit (directive page), active first. */
export async function listHabits(supabase: SupabaseServerClient, userId: string): Promise<HabitListItem[]> {
  const { data, error } = await supabase
    .from("habits")
    .select(
      "*, protocol:protocols!habits_protocol_id_mission_id_fkey(title), mission:missions!habits_mission_id_user_id_fkey(title)",
    )
    .eq("user_id", userId)
    .order("status")
    .order("sort_order")
    .order("created_at");
  if (error) throw fromDbError(error);
  return data.map(({ protocol, mission, ...h }) => ({
    ...(h as Habit),
    protocolTitle: protocol?.title ?? null,
    missionTitle: mission?.title ?? null,
  }));
}

/** Habits due today with today's check and, for unchecked focus habits, the minutes so far. */
export async function listTodayHabits(
  supabase: SupabaseServerClient,
  userId: string,
  today: string,
  timezone: string,
): Promise<HabitToday[]> {
  const [habits, checks] = await Promise.all([
    listHabits(supabase, userId),
    supabase.from("habit_checks").select("habit_id, source, minutes").eq("user_id", userId).eq("local_date", today),
  ]);
  if (checks.error) throw fromDbError(checks.error);
  const due = habits.filter((h) => isDueOn(h, today));
  const pending = due.some((h) => h.rule === "focus" && !checks.data.some((c) => c.habit_id === h.id));
  const sessions = pending ? await loadDaySessions(supabase, userId, today, timezone) : [];
  return due.map((h) => {
    const check = checks.data.find((c) => c.habit_id === h.id) ?? null;
    const focusMinutes =
      h.rule !== "focus" ? null : check?.minutes != null ? Number(check.minutes) : focusMinutesFor(h.protocol_id!, sessions);
    return {
      id: h.id,
      title: h.title,
      rule: h.rule,
      targetMinutes: h.target_minutes,
      missionTitle: h.missionTitle,
      done: check !== null,
      source: (check?.source as HabitToday["source"]) ?? null,
      focusMinutes,
    };
  });
}
