import "server-only";
import { fromDbError } from "@/lib/errors";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { TrackingRecords, WorkRecords } from "../utils/achievement-log";

const LIMIT = 10000;

/** Completed milestones / projects, achieved goals and routines with their checks (ADR 0037 §7). */
export async function loadWorkRecords(supabase: SupabaseServerClient, userId: string): Promise<WorkRecords> {
  const [milestones, projects, goals, habits, checks] = await Promise.all([
    supabase
      .from("milestones")
      .select("id, name, completed_at, project:projects!milestones_project_id_user_id_fkey(name)")
      .eq("user_id", userId)
      .not("completed_at", "is", null)
      .limit(LIMIT),
    supabase.from("projects").select("id, name, completed_at").eq("user_id", userId).not("completed_at", "is", null).limit(LIMIT),
    supabase.from("missions").select("id, title, closed_at").eq("user_id", userId).eq("status", "achieved").not("closed_at", "is", null).limit(LIMIT),
    supabase.from("habits").select("id, title, weekdays").eq("user_id", userId).limit(LIMIT),
    supabase.from("habit_checks").select("habit_id, local_date, created_at").eq("user_id", userId).limit(LIMIT),
  ]);
  for (const r of [milestones, projects, goals, habits, checks]) if (r.error) throw fromDbError(r.error);
  return {
    milestones: milestones.data!.map((m) => ({ id: m.id, name: m.name, completed_at: m.completed_at!, projectName: m.project?.name ?? null })),
    projects: projects.data!.map((p) => ({ id: p.id, name: p.name, completed_at: p.completed_at! })),
    goals: goals.data!.map((g) => ({ id: g.id, title: g.title, closed_at: g.closed_at! })),
    routines: habits.data!.map((h) => ({
      id: h.id,
      title: h.title,
      weekdays: h.weekdays,
      checks: checks.data!.filter((c) => c.habit_id === h.id),
    })),
  };
}

/** XP ledger, cleared quests and unlocked achievements: only meaningful while gamification is on. */
export async function loadTrackingRecords(supabase: SupabaseServerClient, userId: string): Promise<TrackingRecords> {
  const [xp, quests, achievements] = await Promise.all([
    supabase.from("xp_events").select("xp, local_date, created_at").eq("user_id", userId).limit(LIMIT),
    supabase.from("quests").select("id, type, title, cleared_at").eq("user_id", userId).eq("status", "cleared").not("cleared_at", "is", null).limit(LIMIT),
    supabase.from("user_achievements").select("key, unlocked_at").eq("user_id", userId),
  ]);
  for (const r of [xp, quests, achievements]) if (r.error) throw fromDbError(r.error);
  return {
    xp: xp.data!,
    quests: quests.data!.map((q) => ({ ...q, cleared_at: q.cleared_at! })),
    achievements: achievements.data!,
  };
}
