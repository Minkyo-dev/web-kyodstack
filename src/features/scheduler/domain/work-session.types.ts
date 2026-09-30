import type { Tables } from "@/types/database";
import type { PAUSE_REASONS } from "./scheduler.constants";

export type WorkSession = Tables<"work_sessions"> & { source: "timer" | "manual" };

export type PauseReason = (typeof PAUSE_REASONS)[number];
export type SessionPause = { id: string; paused_at: string; resumed_at: string | null; reason: PauseReason | null };
export type WorkLog = {
  id: string;
  focus_score: number | null;
  mood_score: number | null;
  energy_score: number | null;
  note: string | null;
};

/** Session with its task, pause intervals and work log (focus-flow design §1). */
export type SessionWithTask = WorkSession & {
  task: { id: string; title: string };
  pauses: SessionPause[];
  work_log: WorkLog | null;
};

export type DailyReflection = Pick<
  Tables<"daily_reflections">,
  "reflection_date" | "mood_score" | "focus_score" | "energy_score" | "note"
>;

export type TaskPlanActual = {
  task_id: string;
  planned_minutes: number;
  skipped_minutes: number;
  actual_minutes: number;
  paused_minutes: number;
  session_count: number;
  average_focus: number | null;
  reschedule_count: number;
};

/** Sanity bound for one session (spec §26.3 "actual duration is not obviously invalid"). */
export const MAX_SESSION_MINUTES = 16 * 60;
