import "server-only";
import type { ActionContext } from "@/lib/action";
import { fromDbError } from "@/lib/errors";
import { log } from "@/lib/logger";
import type { ProgressDelta } from "@/lib/progress";
import type { Json } from "@/types/database";
import { getSchedulerContext } from "@/features/scheduler/queries/schedule.queries";
import { addLocalDays, toLocalDate } from "@/features/scheduler/utils/timezone";
import type { NewXpEvent } from "../domain/xp.types";
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
export async function evaluateProgress(ctx: ActionContext, now = new Date()): Promise<ProgressDelta | null> {
  try {
    const profile = await getPlayerProfile(ctx.supabase, ctx.user.id);
    if (!profile?.gamification_enabled) return null;
    const { from, to } = await recentRange(ctx, now);
    const { events, result } = await evaluateRange(ctx, from, to, now, false);
    return deltaFrom(events, result);
  } catch (error) {
    log({ action: "gamification.evaluate", userId: ctx.user.id, success: false, errorCode: "INTERNAL_ERROR", detail: String(error) });
    return null;
  }
}

/** Nightly: re-evaluate yesterday and today (settles commitment XP). Admin client → explicit user id. */
export async function reconcileProgress(ctx: ActionContext, now: Date): Promise<number> {
  const profile = await getPlayerProfile(ctx.supabase, ctx.user.id);
  if (!profile?.gamification_enabled) return 0;
  const { from, to } = await recentRange(ctx, now);
  const { events } = await evaluateRange(ctx, from, to, now, true);
  return events.length;
}

/** Opt in: full idempotent evaluation from first activity through today, then flip the flag. */
export async function enableGamification(ctx: ActionContext, now = new Date()): Promise<{ level: number; total: number }> {
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
  const profile = await getPlayerProfile(ctx.supabase, ctx.user.id);
  return { level: profile?.level ?? 1, total: profile?.total_xp ?? 0 };
}

export async function updateGamificationSettings(ctx: ActionContext, input: GamificationSettingsInput): Promise<void> {
  const { error } = await ctx.supabase.from("player_profiles").update(input).eq("user_id", ctx.user.id);
  if (error) throw fromDbError(error);
}
