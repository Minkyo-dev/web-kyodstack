import "server-only";
import type { ActionContext } from "@/lib/action";
import { fromDbError } from "@/lib/errors";
import { log } from "@/lib/logger";
import type { ProgressDelta } from "@/lib/progress";
import type { Json } from "@/types/database";
import { getSchedulerContext } from "@/features/scheduler/queries/schedule.queries";
import { addLocalDays, toLocalDate } from "@/features/scheduler/utils/timezone";
import type { NewXpEvent } from "../domain/xp.types";
import { evaluateAchievements } from "./achievement.service";
import { ensureQuests, evaluateQuests } from "./quest.service";
import { ACHIEVEMENTS } from "../utils/achievements";
import { firstActivityDate, getPlayerProfile, loadLedger, loadXpRaw } from "../queries/xp.queries";
import type { GamificationSettingsInput } from "../schemas/gamification.schema";
import { deltaFrom, type AwardResult } from "../utils/delta";
import { buildDayFacts } from "../utils/xp-facts";
import { evaluateDay } from "../utils/xp-rules";

const WINDOW_DAYS = 30;

function datesBetween(from: string, to: string, tz: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addLocalDays(d, 1, tz)) out.push(d);
  return out;
}

async function award(ctx: ActionContext, events: NewXpEvent[], admin: boolean): Promise<AwardResult | null> {
  const p_events = events.map((e) => ({
    rule: e.rule,
    source_type: e.sourceType,
    source_id: e.sourceId,
    local_date: e.localDate,
    xp: e.xp,
    metadata: e.metadata,
  })) as unknown as Json;
  const { data, error } = await ctx.supabase.rpc("award_xp", admin ? { p_events, p_user_id: ctx.user.id } : { p_events });
  if (error) throw fromDbError(error);
  return (data as AwardResult[] | null)?.[0] ?? null;
}

async function evaluateRange(ctx: ActionContext, from: string, to: string, now: Date, admin: boolean) {
  const raw = await loadXpRaw(ctx.supabase, ctx.user.id, from, to, now);
  const ledger = await loadLedger(ctx.supabase, ctx.user.id, from, to);
  const facts = buildDayFacts(raw, datesBetween(from, to, raw.timezone));
  const events = facts.flatMap((f) => evaluateDay(f, ledger.filter((e) => e.localDate === f.date)));
  const result = events.length ? await award(ctx, events, admin) : null;
  return { events, result };
}

async function recentRange(ctx: ActionContext, now: Date) {
  const { timezone } = await getSchedulerContext(ctx.supabase, ctx.user.id);
  const today = toLocalDate(now, timezone);
  return { from: addLocalDays(today, -1, timezone), to: today };
}

/** After a core action. Never throws: failures are logged and the nightly job repairs them. */
export async function evaluateProgress(ctx: ActionContext, now = new Date(), admin = false): Promise<ProgressDelta | null> {
  try {
    const profile = await getPlayerProfile(ctx.supabase, ctx.user.id);
    if (!profile?.gamification_enabled) return null;
    return await evaluateAll(ctx, now, admin);
  } catch (error) {
    log({ action: "gamification.evaluate", userId: ctx.user.id, success: false, errorCode: "INTERNAL_ERROR", detail: String(error) });
    return null;
  }
}

async function evaluateAll(ctx: ActionContext, now: Date, admin: boolean): Promise<ProgressDelta | null> {
  const { from, to } = await recentRange(ctx, now);
  const xp = await evaluateRange(ctx, from, to, now, admin);
  const { cleared } = await evaluateQuests(ctx, now);
  const questEvents: NewXpEvent[] = cleared.map((q) => ({ rule: "quest", sourceType: "quest", sourceId: q.id, localDate: to, xp: q.xp, metadata: {} }));
  const questAward = questEvents.length ? await award(ctx, questEvents, admin) : null;
  const keys = await evaluateAchievements(ctx, now);
  const awards = [xp.result, questAward].filter((a): a is AwardResult => !!a);
  return deltaFrom([...xp.events, ...questEvents], awards, {
    questsCleared: cleared.map((q) => ({ type: q.type, title: q.title, xp: q.xp })),
    achievements: keys.map((k) => ({ key: k, name: ACHIEVEMENTS.find((a) => a.key === k)!.name })),
  });
}

/** Nightly: create/expire quests, then re-evaluate yesterday and today. Admin client → explicit user id. */
export async function reconcileProgress(ctx: ActionContext, now: Date): Promise<number> {
  const profile = await getPlayerProfile(ctx.supabase, ctx.user.id);
  if (!profile?.gamification_enabled) return 0;
  await ensureQuests(ctx, now, true);
  const d = await evaluateAll(ctx, now, true);
  return d ? d.xp.length : 0;
}

/** Opt in: full idempotent evaluation from first activity through today, then flip the flag. */
export async function enableGamification(
  ctx: ActionContext,
  now = new Date(),
): Promise<{ level: number; total: number; achievements: number }> {
  // Plain insert (not upsert): users cannot update user_id. An existing row is fine.
  const ins = await ctx.supabase.from("player_profiles").insert({ user_id: ctx.user.id });
  if (ins.error && ins.error.code !== "23505") throw fromDbError(ins.error);
  const { timezone } = await getSchedulerContext(ctx.supabase, ctx.user.id);
  const today = toLocalDate(now, timezone);
  const first = await firstActivityDate(ctx.supabase, ctx.user.id, timezone);
  if (first) {
    for (let from = first; from <= today; from = addLocalDays(from, WINDOW_DAYS, timezone)) {
      const end = addLocalDays(from, WINDOW_DAYS - 1, timezone);
      await evaluateRange(ctx, from, end < today ? end : today, now, false);
    }
  }
  const upd = await ctx.supabase
    .from("player_profiles")
    .update({ gamification_enabled: true, backfilled_at: now.toISOString() })
    .eq("user_id", ctx.user.id);
  if (upd.error) throw fromDbError(upd.error);
  // Achievements from history are summarized in one toast; quests start today (none backfilled).
  const keys = await evaluateAchievements(ctx, now);
  await ensureQuests(ctx, now);
  const profile = await getPlayerProfile(ctx.supabase, ctx.user.id);
  return { level: profile?.level ?? 1, total: profile?.total_xp ?? 0, achievements: keys.length };
}

export async function updateGamificationSettings(ctx: ActionContext, input: GamificationSettingsInput): Promise<void> {
  const { error } = await ctx.supabase.from("player_profiles").update(input).eq("user_id", ctx.user.id);
  if (error) throw fromDbError(error);
}
