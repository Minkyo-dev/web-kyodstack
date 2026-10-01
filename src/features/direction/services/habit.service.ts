import "server-only";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import { getSchedulerContext } from "@/features/scheduler/queries/schedule.queries";
import { addLocalDays, todayLocalDate } from "@/features/scheduler/utils/timezone";
import { isNewLink } from "../domain/link-rules";
import { canCheckToday, isDueOn, focusMinutesFor } from "../domain/habits";
import type { Habit } from "../domain/direction.types";
import { loadDaySessions } from "../queries/habit.queries";
import type { CreateHabitInput, SetHabitCheckInput, UpdateHabitInput } from "../schemas/direction.schema";

/** A habit's protocol link (ADR 0021): owned; a new link needs an active protocol on an active path. */
async function resolveHabitProtocol(
  ctx: ActionContext,
  protocolId: string | null,
  currentProtocolId: string | null,
): Promise<{ protocol_id: string | null; mission_id: string | null }> {
  if (!protocolId) return { protocol_id: null, mission_id: null };
  const { data, error } = await ctx.supabase
    .from("protocols")
    .select("id, mission_id, status, path:paths!protocols_path_id_mission_id_fkey(status)")
    .eq("id", protocolId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new AppError("NOT_FOUND", "실행 방식을 찾을 수 없습니다.");
  if (isNewLink(protocolId, currentProtocolId) && (data.status !== "active" || data.path?.status !== "active")) {
    throw new AppError("VALIDATION_ERROR", "보관되었거나 교체된 실행 방식에는 연결할 수 없습니다.");
  }
  return { protocol_id: data.id, mission_id: data.mission_id };
}

export async function createHabit(ctx: ActionContext, input: CreateHabitInput): Promise<Habit> {
  const link = await resolveHabitProtocol(ctx, input.protocolId, null);
  const { count } = await ctx.supabase.from("habits").select("id", { count: "exact", head: true }).eq("user_id", ctx.user.id);
  const { data, error } = await ctx.supabase
    .from("habits")
    .insert({
      user_id: ctx.user.id,
      title: input.title,
      rule: input.rule,
      target_minutes: input.targetMinutes,
      weekdays: input.weekdays,
      sort_order: count ?? 0,
      ...link,
    })
    .select()
    .single();
  if (error) throw fromDbError(error);
  return data as Habit;
}

export async function updateHabit(ctx: ActionContext, input: UpdateHabitInput): Promise<Habit> {
  const before = await ctx.supabase
    .from("habits")
    .select("protocol_id")
    .eq("id", input.habitId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (before.error) throw fromDbError(before.error);
  if (!before.data) throw new AppError("NOT_FOUND");
  const link = await resolveHabitProtocol(ctx, input.protocolId, before.data.protocol_id);
  const { data, error } = await ctx.supabase
    .from("habits")
    .update({
      title: input.title,
      rule: input.rule,
      target_minutes: input.targetMinutes,
      weekdays: input.weekdays,
      status: input.status,
      sort_order: input.sortOrder,
      ...link,
    })
    .eq("id", input.habitId)
    .eq("user_id", ctx.user.id)
    .select()
    .single();
  if (error) throw fromDbError(error);
  return data as Habit;
}

/** Tick or untick a `check` habit for today (user's zone). Unticking also removes the check's XP. */
export async function setHabitCheck(ctx: ActionContext, input: SetHabitCheckInput, now = new Date()): Promise<void> {
  const { timezone } = await getSchedulerContext(ctx.supabase, ctx.user.id);
  const today = todayLocalDate(timezone, now);
  const { data: habit, error } = await ctx.supabase
    .from("habits")
    .select("id, rule, status, weekdays")
    .eq("id", input.habitId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!habit) throw new AppError("NOT_FOUND");
  if (!canCheckToday(habit as Pick<Habit, "rule" | "status" | "weekdays">, today)) {
    throw new AppError("VALIDATION_ERROR", "오늘 체크할 수 없는 습관입니다.");
  }

  if (input.done) {
    const ins = await ctx.supabase
      .from("habit_checks")
      .insert({ user_id: ctx.user.id, habit_id: habit.id, local_date: today, source: "manual" });
    if (ins.error && ins.error.code !== "23505") throw fromDbError(ins.error);
    return;
  }
  const { data: check, error: e2 } = await ctx.supabase
    .from("habit_checks")
    .select("id")
    .eq("habit_id", habit.id)
    .eq("user_id", ctx.user.id)
    .eq("local_date", today)
    .eq("source", "manual")
    .maybeSingle();
  if (e2) throw fromDbError(e2);
  if (!check) return;
  const xp = await ctx.supabase.from("xp_events").delete().eq("user_id", ctx.user.id).eq("rule", "habit").eq("source_id", check.id);
  if (xp.error) throw fromDbError(xp.error);
  const del = await ctx.supabase.from("habit_checks").delete().eq("id", check.id).eq("user_id", ctx.user.id);
  if (del.error) throw fromDbError(del.error);
}

/**
 * Record `focus` checks for habits whose protocol got enough focused timer minutes on each local date.
 * Existing checks are left alone. Runs on scheduler page load (today) and nightly (yesterday + today).
 */
export async function syncFocusChecks(ctx: ActionContext, dates: string[]): Promise<number> {
  const { data: habits, error } = await ctx.supabase
    .from("habits")
    .select("id, rule, status, weekdays, protocol_id, target_minutes")
    .eq("user_id", ctx.user.id)
    .eq("status", "active")
    .eq("rule", "focus");
  if (error) throw fromDbError(error);
  if (!habits.length) return 0;
  const { timezone } = await getSchedulerContext(ctx.supabase, ctx.user.id);
  let inserted = 0;
  for (const date of dates) {
    const due = habits.filter((h) => isDueOn(h as Pick<Habit, "rule" | "status" | "weekdays">, date));
    if (!due.length) continue;
    const sessions = await loadDaySessions(ctx.supabase, ctx.user.id, date, timezone);
    const rows = due
      .map((h) => ({ h, minutes: focusMinutesFor(h.protocol_id!, sessions) }))
      .filter(({ h, minutes }) => minutes >= h.target_minutes!)
      .map(({ h, minutes }) => ({ user_id: ctx.user.id, habit_id: h.id, local_date: date, source: "focus", minutes }));
    for (const row of rows) {
      const ins = await ctx.supabase.from("habit_checks").insert(row);
      if (ins.error && ins.error.code !== "23505") throw fromDbError(ins.error);
      if (!ins.error) inserted++;
    }
  }
  return inserted;
}

/** Nightly: yesterday and today in the user's zone (late sessions settle yesterday). */
export async function syncRecentFocusChecks(ctx: ActionContext, now = new Date()): Promise<number> {
  const { timezone } = await getSchedulerContext(ctx.supabase, ctx.user.id);
  const today = todayLocalDate(timezone, now);
  return syncFocusChecks(ctx, [addLocalDays(today, -1, timezone), today]);
}
