import "server-only";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import type { Json } from "@/types/database";
import { getSchedulerContext } from "@/features/scheduler/queries/schedule.queries";
import { localWeek, todayLocalDate } from "@/features/scheduler/utils/timezone";
import { updateProtocol } from "@/features/direction/services/direction.service";
import { updateHabit } from "@/features/direction/services/habit.service";
import type { HabitRule } from "@/features/direction/domain/direction.types";
import { COACH_VERSION, coachProposals, HabitDaysPayload, ReviewPayload, RuleMinutesPayload } from "../domain/coach";
import { loadCoachInput } from "../queries/coach.queries";

async function currentWeek(ctx: ActionContext, now: Date) {
  const { timezone, settings } = await getSchedulerContext(ctx.supabase, ctx.user.id);
  const today = todayLocalDate(timezone, now);
  return { today, timezone, weekStart: localWeek(today, timezone, settings.week_starts_on).startDate };
}

/**
 * This week's coaching (ADR 0040 §5): generated once per local week, lazily. Duplicate inserts (two tabs) are
 * ignored by the unique keys; a lost race on the one-focus index means the other request already wrote the week.
 */
export async function ensureWeeklyCoaching(ctx: ActionContext, now = new Date()): Promise<string> {
  const { today, timezone, weekStart } = await currentWeek(ctx, now);
  const existing = await ctx.supabase.from("assistant_proposals").select("id", { count: "exact", head: true }).eq("user_id", ctx.user.id).eq("week_start", weekStart);
  if (existing.error) throw fromDbError(existing.error);
  if ((existing.count ?? 0) > 0) return weekStart;
  const drafts = coachProposals(await loadCoachInput(ctx.supabase, ctx.user.id, today, timezone, now));
  if (drafts.length === 0) return weekStart;
  const { error } = await ctx.supabase.from("assistant_proposals").upsert(
    drafts.map((d) => ({
      user_id: ctx.user.id,
      week_start: weekStart,
      kind: d.kind,
      target_key: d.targetKey,
      title: d.title,
      reason: d.reason,
      payload: d.payload as unknown as Json,
      evidence: d.evidence as unknown as Json,
      focus: d.focus,
      rules_version: COACH_VERSION,
    })),
    { onConflict: "user_id,week_start,kind,target_key", ignoreDuplicates: true },
  );
  if (error && error.code !== "23505") throw fromDbError(error);
  return weekStart;
}

async function loadOpen(ctx: ActionContext, proposalId: string, now: Date) {
  const { data, error } = await ctx.supabase
    .from("assistant_proposals")
    .select("id, kind, payload, status, week_start")
    .eq("id", proposalId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new AppError("NOT_FOUND");
  if (data.status !== "proposed") throw new AppError("CONFLICT", "이미 결정한 제안입니다.");
  const { weekStart } = await currentWeek(ctx, now);
  if (data.week_start !== weekStart) throw new AppError("CONFLICT", "지난주 제안은 적용할 수 없습니다.");
  return data;
}

async function decide(ctx: ActionContext, proposalId: string, status: "applied" | "dismissed") {
  const { error } = await ctx.supabase
    .from("assistant_proposals")
    .update({ status, decided_at: new Date().toISOString() })
    .eq("id", proposalId)
    .eq("user_id", ctx.user.id)
    .eq("status", "proposed");
  if (error) throw fromDbError(error);
}

/** The target moved on since the proposal: close it and say so (ADR 0040 §2). */
async function stale(ctx: ActionContext, proposalId: string): Promise<never> {
  await decide(ctx, proposalId, "dismissed");
  throw new AppError("CONFLICT", "이미 바뀌었습니다. 이 제안은 닫았어요.");
}

const sameDays = (a: number[], b: number[]) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);

async function loadHabit(ctx: ActionContext, habitId: string) {
  const { data, error } = await ctx.supabase
    .from("habits")
    .select("id, title, rule, target_minutes, weekdays, protocol_id, status, sort_order")
    .eq("id", habitId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (error) throw fromDbError(error);
  return data;
}
type HabitRow = NonNullable<Awaited<ReturnType<typeof loadHabit>>>;
const habitUpdate = (h: HabitRow, patch: { targetMinutes?: number; weekdays?: number[] }) => ({
  habitId: h.id,
  title: h.title,
  rule: h.rule as HabitRule,
  targetMinutes: patch.targetMinutes ?? h.target_minutes,
  weekdays: patch.weekdays ?? h.weekdays,
  protocolId: h.protocol_id,
  status: "active" as const,
  sortOrder: h.sort_order,
});

/**
 * Apply through the existing services (their checks apply). Freshness accepts the "from" or the already-applied
 * "to" value, so retrying after a partial failure is safe (ADR 0040 §3). Returns where to go for `review`.
 */
export async function applyProposal(ctx: ActionContext, proposalId: string, now = new Date()): Promise<{ href: string | null }> {
  const p = await loadOpen(ctx, proposalId, now);
  let href: string | null = null;
  if (p.kind === "rule_minutes") {
    const pl = RuleMinutesPayload.parse(p.payload);
    const { data: proto, error } = await ctx.supabase
      .from("protocols")
      .select("id, title, steps, intended_minutes, status, sort_order")
      .eq("id", pl.protocolId)
      .eq("user_id", ctx.user.id)
      .maybeSingle();
    if (error) throw fromDbError(error);
    if (!proto || proto.status !== "active" || ![pl.from, pl.to].includes(proto.intended_minutes ?? -1)) return stale(ctx, proposalId);
    if (proto.intended_minutes !== pl.to) {
      await updateProtocol(ctx, { protocolId: proto.id, title: proto.title, steps: proto.steps, intendedMinutes: pl.to, status: "active", sortOrder: proto.sort_order });
    }
    for (const h of pl.habits) {
      const habit = await loadHabit(ctx, h.id);
      if (!habit || habit.status !== "active" || habit.target_minutes !== h.from) continue; // changed or already done
      await updateHabit(ctx, habitUpdate(habit, { targetMinutes: h.to }));
    }
  } else if (p.kind === "habit_days") {
    const pl = HabitDaysPayload.parse(p.payload);
    const habit = await loadHabit(ctx, pl.habitId);
    if (!habit || habit.status !== "active" || !(sameDays(habit.weekdays, pl.from) || sameDays(habit.weekdays, pl.to))) return stale(ctx, proposalId);
    if (!sameDays(habit.weekdays, pl.to)) await updateHabit(ctx, habitUpdate(habit, { weekdays: pl.to }));
  } else {
    href = ReviewPayload.parse(p.payload).href;
  }
  await decide(ctx, proposalId, "applied");
  return { href };
}

export async function dismissProposal(ctx: ActionContext, proposalId: string, now = new Date()): Promise<void> {
  await loadOpen(ctx, proposalId, now);
  await decide(ctx, proposalId, "dismissed");
}
