import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { fromDbError } from "@/lib/errors";
import { getSchedulerContext } from "@/features/scheduler/queries/schedule.queries";
import { addLocalDays, localDayRange, toLocalDate } from "@/features/scheduler/utils/timezone";
import { focusStats } from "@/features/scheduler/utils/focus";
import { XP_RULES, type ExistingXp, type XpRaw, type XpRule } from "../domain/xp.types";

const LIMIT = 10000;
const CHUNK = 200;
const PAUSES = "pauses:work_session_pauses!work_session_pauses_session_id_user_id_fkey(paused_at, resumed_at)";
const chunks = <T,>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / CHUNK) }, (_, i) => xs.slice(i * CHUNK, (i + 1) * CHUNK));

export type PlayerProfile = {
  level: number;
  total_xp: number;
  gamification_enabled: boolean;
  animations_enabled: boolean;
  achievement_toasts: boolean;
  backfilled_at: string | null;
  equipped_title: string | null;
};

export async function getPlayerProfile(supabase: SupabaseServerClient, userId: string): Promise<PlayerProfile | null> {
  const { data, error } = await supabase
    .from("player_profiles")
    .select("level, total_xp, gamification_enabled, animations_enabled, achievement_toasts, backfilled_at, equipped_title")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw fromDbError(error);
  return data;
}

/** Raw rows for the local days [from, to]. Every query filters user_id (also used by the nightly job). */
export async function loadXpRaw(supabase: SupabaseServerClient, userId: string, from: string, to: string, now: Date): Promise<XpRaw> {
  const { timezone, settings } = await getSchedulerContext(supabase, userId);
  const start = localDayRange(from, timezone).start;
  const end = localDayRange(to, timezone).end;
  const lookback = localDayRange(addLocalDays(from, -2, timezone), timezone).start;

  const [sessions, blocks, completed, habitChecks, vocabReviews] = await Promise.all([
    supabase
      .from("work_sessions")
      .select(`id, task_id, schedule_block_id, source, started_at, ended_at, ${PAUSES}`)
      .eq("user_id", userId)
      .gte("started_at", lookback)
      .lt("started_at", end)
      .limit(LIMIT),
    supabase
      .from("schedule_blocks")
      .select("id, task_id, starts_at, ends_at, status, created_at, updated_at")
      .eq("user_id", userId)
      .gte("starts_at", lookback)
      .lt("starts_at", end)
      .limit(LIMIT),
    supabase
      .from("tasks")
      .select("id, completed_at")
      .eq("user_id", userId)
      .eq("status", "completed")
      .gte("completed_at", start)
      .lt("completed_at", end)
      .limit(LIMIT),
    supabase
      .from("habit_checks")
      .select("id, local_date, created_at")
      .eq("user_id", userId)
      .gte("local_date", from)
      .lte("local_date", to)
      .limit(LIMIT),
    supabase.from("vocab_reviews").select("id, reviewed_at").eq("user_id", userId).gte("reviewed_at", start).lt("reviewed_at", end).limit(LIMIT),
  ]);
  for (const r of [sessions, blocks, completed, habitChecks, vocabReviews]) if (r.error) throw fromDbError(r.error);

  const revisions: XpRaw["revisions"] = [];
  for (const ids of chunks(blocks.data!.map((b) => b.id))) {
    const r = await supabase
      .from("schedule_block_revisions")
      .select("schedule_block_id, change_type, previous_starts_at, new_starts_at, created_at")
      .eq("user_id", userId)
      .in("schedule_block_id", ids);
    if (r.error) throw fromDbError(r.error);
    for (const x of r.data) revisions.push({ ...x, block_id: x.schedule_block_id });
  }

  // Lifetime focused minutes of the completed tasks.
  const taskFocus: Record<string, number> = {};
  for (const ids of chunks(completed.data!.map((t) => t.id))) {
    const r = await supabase
      .from("work_sessions")
      .select(`task_id, started_at, ended_at, ${PAUSES}`)
      .eq("user_id", userId)
      .in("task_id", ids)
      .not("ended_at", "is", null);
    if (r.error) throw fromDbError(r.error);
    for (const s of r.data) taskFocus[s.task_id] = (taskFocus[s.task_id] ?? 0) + focusStats(s, s.pauses ?? []).focusedMs / 60_000;
  }

  return {
    now: now.toISOString(),
    timezone,
    settings: {
      planned_work_days: settings.planned_work_days,
      min_meaningful_minutes: settings.min_meaningful_minutes,
      commit_lead_minutes: settings.commit_lead_minutes,
    },
    sessions: sessions.data!.map((s) => ({ ...s, pauses: s.pauses ?? [] })),
    completedTasks: completed.data!.filter((t) => t.completed_at).map((t) => ({ id: t.id, completed_at: t.completed_at! })),
    taskFocus,
    blocks: blocks.data!,
    revisions,
    habitChecks: habitChecks.data!,
    vocabReviews: vocabReviews.data!,
  };
}

export async function loadLedger(supabase: SupabaseServerClient, userId: string, from: string, to: string) {
  const { data, error } = await supabase
    .from("xp_events")
    .select("rule, source_id, xp, local_date")
    .eq("user_id", userId)
    .gte("local_date", from)
    .lte("local_date", to)
    .limit(LIMIT);
  if (error) throw fromDbError(error);
  return data.map((r): ExistingXp & { localDate: string } => ({ rule: r.rule as XpRule, sourceId: r.source_id, xp: r.xp, localDate: r.local_date }));
}

export async function xpByRuleSince(supabase: SupabaseServerClient, userId: string, from: string): Promise<Record<XpRule, number>> {
  const { data, error } = await supabase.from("xp_events").select("rule, xp").eq("user_id", userId).gte("local_date", from).limit(LIMIT);
  if (error) throw fromDbError(error);
  const out = Object.fromEntries(XP_RULES.map((r) => [r, 0])) as Record<XpRule, number>;
  for (const r of data) if (r.rule in out) out[r.rule as XpRule] += r.xp;
  return out;
}

/** Earliest local day with a task or session; null for a new account. */
export async function firstActivityDate(supabase: SupabaseServerClient, userId: string, timezone: string): Promise<string | null> {
  const [t, s] = await Promise.all([
    supabase.from("tasks").select("created_at").eq("user_id", userId).order("created_at").limit(1).maybeSingle(),
    supabase.from("work_sessions").select("started_at").eq("user_id", userId).order("started_at").limit(1).maybeSingle(),
  ]);
  if (t.error) throw fromDbError(t.error);
  if (s.error) throw fromDbError(s.error);
  const first = [t.data?.created_at, s.data?.started_at].filter((x): x is string => !!x).sort()[0];
  return first ? toLocalDate(first, timezone) : null;
}
