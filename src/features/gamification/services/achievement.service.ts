import "server-only";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { commitments } from "@/features/analytics/utils/stats";
import { focusStats } from "@/features/scheduler/utils/focus";
import { getSchedulerContext } from "@/features/scheduler/queries/schedule.queries";
import { ACHIEVEMENTS, newlyUnlocked, TITLES, type AchievementFacts } from "../utils/achievements";

const LIMIT = 10000;
const PAUSES = "pauses:work_session_pauses!work_session_pauses_session_id_user_id_fkey(paused_at, resumed_at)";

export async function listUnlocked(supabase: SupabaseServerClient, userId: string) {
  const [a, t] = await Promise.all([
    supabase.from("user_achievements").select("key, unlocked_at").eq("user_id", userId),
    supabase.from("user_titles").select("key, unlocked_at").eq("user_id", userId),
  ]);
  if (a.error) throw fromDbError(a.error);
  if (t.error) throw fromDbError(t.error);
  return { achievements: a.data, titles: t.data };
}

/** Lifetime facts. Only loaded when something is still locked. */
export async function loadAchievementFacts(supabase: SupabaseServerClient, userId: string, now: Date): Promise<AchievementFacts> {
  const { settings } = await getSchedulerContext(supabase, userId);
  const [sessions, plan, blocks, revisions, quests] = await Promise.all([
    supabase.from("work_sessions").select(`id, task_id, schedule_block_id, source, started_at, ended_at, ${PAUSES}`).eq("user_id", userId).limit(LIMIT),
    supabase.from("task_plan_actual").select("user_estimated_minutes, actual_minutes, status").eq("user_id", userId).eq("status", "completed").limit(LIMIT),
    supabase.from("schedule_blocks").select("id, task_id, starts_at, ends_at, status, created_at, updated_at").eq("user_id", userId).limit(LIMIT),
    supabase.from("schedule_block_revisions").select("schedule_block_id, change_type, previous_starts_at, new_starts_at, created_at").eq("user_id", userId).limit(LIMIT),
    supabase.from("quests").select("type").eq("user_id", userId).eq("status", "cleared"),
  ]);
  for (const r of [sessions, plan, blocks, revisions, quests]) if (r.error) throw fromDbError(r.error);
  const s = sessions.data!.map((x) => ({ ...x, pauses: x.pauses ?? [], focus_score: null }));
  const perfect = commitments({
    now: now.toISOString(),
    settings: { planned_work_days: settings.planned_work_days, min_meaningful_minutes: settings.min_meaningful_minutes, commit_lead_minutes: settings.commit_lead_minutes },
    blocks: blocks.data!,
    revisions: revisions.data!.map((r) => ({ ...r, block_id: r.schedule_block_id })),
    sessions: s,
  }).filter((c) => c.kind === "final" && c.score === 1).length;
  return {
    sessionFocus: s.filter((x) => x.source === "timer" && x.ended_at).map((x) => focusStats(x, x.pauses).focusedMs / 60_000),
    calibrationErrors: plan.data!
      .filter((p) => p.user_estimated_minutes && p.actual_minutes)
      .map((p) => Math.abs(Number(p.actual_minutes) / Number(p.user_estimated_minutes) - 1)),
    perfectCommitments: perfect,
    weeklyCleared: quests.data!.filter((q) => q.type === "weekly").length,
    recoveryCleared: quests.data!.filter((q) => q.type === "recovery").length,
  };
}

/** Unlock what the facts now satisfy (and its title). Returns the new keys. */
export async function evaluateAchievements(ctx: ActionContext, now: Date): Promise<string[]> {
  const { achievements } = await listUnlocked(ctx.supabase, ctx.user.id);
  const unlocked = new Set(achievements.map((a) => a.key));
  if (ACHIEVEMENTS.every((a) => unlocked.has(a.key))) return [];
  const keys = newlyUnlocked(await loadAchievementFacts(ctx.supabase, ctx.user.id, now), unlocked);
  if (keys.length === 0) return [];
  const rows = keys.map((key) => ({ user_id: ctx.user.id, key }));
  const titles = keys.map((k) => ACHIEVEMENTS.find((a) => a.key === k)!.titleKey).filter((k): k is string => !!k).map((key) => ({ user_id: ctx.user.id, key }));
  const a = await ctx.supabase.from("user_achievements").upsert(rows, { onConflict: "user_id,key", ignoreDuplicates: true });
  if (a.error) throw fromDbError(a.error);
  if (titles.length) {
    const t = await ctx.supabase.from("user_titles").upsert(titles, { onConflict: "user_id,key", ignoreDuplicates: true });
    if (t.error) throw fromDbError(t.error);
  }
  return keys;
}

export async function equipTitle(ctx: ActionContext, key: string | null): Promise<void> {
  if (key !== null && !TITLES[key]) throw new AppError("VALIDATION_ERROR");
  const { error } = await ctx.supabase.from("player_profiles").update({ equipped_title: key }).eq("user_id", ctx.user.id);
  if (error) throw error.code === "23514" ? new AppError("CONFLICT", "아직 얻지 않은 칭호입니다.") : fromDbError(error);
}
