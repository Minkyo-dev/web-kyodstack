import type { Tables } from "@/types/database";

export type WorkSession = Tables<"work_sessions"> & { source: "timer" | "manual" };

/** Session with just enough task info to render on the calendar and in the timer. */
export type SessionWithTask = WorkSession & { task: { id: string; title: string } };

export type DailyReflection = Pick<
  Tables<"daily_reflections">,
  "reflection_date" | "mood_score" | "focus_score" | "energy_score" | "note"
>;

export type TaskPlanActual = {
  task_id: string;
  planned_minutes: number;
  skipped_minutes: number;
  actual_minutes: number;
  session_count: number;
  average_focus: number | null;
  reschedule_count: number;
};

/** Sanity bound for one session (spec §26.3 "actual duration is not obviously invalid"). */
export const MAX_SESSION_MINUTES = 16 * 60;
