import "server-only";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import type { Json } from "@/types/database";
import { getSchedulerContext } from "@/features/scheduler/queries/schedule.queries";
import { toLocalDate } from "@/features/scheduler/utils/timezone";
import type { ObjectiveDraft, QuestDraft } from "../domain/quest.types";
import { listQuests, loadQuestFacts, loadQuestGenContext } from "../queries/quest.queries";
import { getPlayerProfile } from "../queries/xp.queries";
import { loadStatInput } from "@/features/analytics/queries/stat-input.queries";
import { computeStats } from "@/features/analytics/utils/stats";
import { STAT_TYPES } from "@/features/analytics/domain/stats.types";
import { questPool, validatePicks, type PickerOutput } from "../utils/quest-pool";

/** Plain-data input for an AI picker (F2 spec §2); provided by the jobs layer so gamification never imports AI. */
export type PickerInput = {
  candidates: { key: string; label: string; target: number }[];
  capacity: number | null;
  plannedMinutes: number;
  plannedTasks: number;
  topTitles: string[];
  stats: Record<string, number | null>;
};
export type QuestPicker = (input: PickerInput) => Promise<PickerOutput | null>;
import { dailyQuest, evaluateQuest, nextSwap, QUEST_RULES_VERSION, recoveryDue, recoveryQuest, weeklyQuest } from "../utils/quest-rules";

const obj = (o: ObjectiveDraft, position?: number) => ({ ...(position ? { position } : {}), metric: o.metric, params: o.params, target_value: o.target });

async function create(ctx: ActionContext, d: QuestDraft, admin: boolean, ai?: { reason: string | null }) {
  const { data: id, error } = await ctx.supabase.rpc("create_quest", {
    p_quest: { type: d.type, title: d.title, period_start: d.periodStart, period_end: d.periodEnd, reward_xp: d.rewardXp, rules_version: QUEST_RULES_VERSION, spare: d.spare.map((s) => obj(s)) } as unknown as Json,
    p_objectives: d.objectives.map((o, i) => obj(o, i + 1)) as unknown as Json,
    ...(admin ? { p_user_id: ctx.user.id } : {}),
  });
  // A concurrent recovery insert loses the partial unique index race: fine, one exists.
  if (error && error.code !== "23505") throw fromDbError(error);
  if (ai && id) {
    const up = await ctx.supabase.from("quests").update({ generated_by: "ai", reason: ai.reason }).eq("id", id as string).eq("user_id", ctx.user.id);
    if (up.error) throw fromDbError(up.error);
  }
}

/** AI-picked daily quest when a picker is given and its picks validate; otherwise the E2 rule quest. */
async function dailyDraft(ctx: ActionContext, daily: Parameters<typeof dailyQuest>[0], now: Date, picker?: QuestPicker) {
  const rule = dailyQuest(daily);
  if (!picker) return { draft: rule };
  const stats = computeStats(await loadStatInput(ctx.supabase, ctx.user.id, now));
  const pool = questPool(daily);
  const out = await picker({
    candidates: pool.map((c) => ({ key: c.key, label: c.label, target: c.draft.target })),
    capacity: daily.capacity,
    plannedMinutes: Math.round(daily.plannedMinutes),
    plannedTasks: daily.plannedTaskIds.length,
    topTitles: daily.taskTitles ?? [],
    stats: Object.fromEntries(STAT_TYPES.map((t) => [t, stats[t].value])),
  }).catch(() => null);
  const v = out ? validatePicks(pool, out, daily.capacity) : null;
  if (!v) return { draft: rule };
  return { draft: { ...rule, title: v.title, objectives: v.objectives, spare: v.spare }, ai: { reason: v.reason } };
}

/** Expire past quests and create today's/this week's/recovery quests (idempotent). No-op while gamification is off. */
export async function ensureQuests(
  ctx: ActionContext,
  now: Date,
  admin = false,
  opts: { picker?: QuestPicker } = {},
): Promise<void> {
  const profile = await getPlayerProfile(ctx.supabase, ctx.user.id);
  if (!profile?.gamification_enabled) return;
  const { timezone } = await getSchedulerContext(ctx.supabase, ctx.user.id);
  const today = toLocalDate(now, timezone);
  const exp = await ctx.supabase.from("quests").update({ status: "expired" }).eq("user_id", ctx.user.id).eq("status", "active").lt("period_end", today);
  if (exp.error) throw fromDbError(exp.error);

  const existing = await ctx.supabase.from("quests").select("type, period_start, status").eq("user_id", ctx.user.id).gte("period_end", today);
  if (existing.error) throw fromDbError(existing.error);
  const g = await loadQuestGenContext(ctx.supabase, ctx.user.id, now);
  const has = (type: string, start: string) => existing.data.some((q) => q.type === type && q.period_start === start);
  if (!has("daily", g.today)) {
    const d = await dailyDraft(ctx, g.daily, now, opts.picker);
    await create(ctx, d.draft, admin, d.ai);
  }
  if (!has("weekly", g.week.start)) await create(ctx, weeklyQuest(g.weekly), admin);
  const activeRecovery = existing.data.some((q) => q.type === "recovery" && q.status === "active");
  if (!activeRecovery && recoveryDue({ today: g.today, ...g.recovery })) await create(ctx, recoveryQuest(g.today, g.tomorrow), admin);
}

/** Recompute active quests' objectives; clear completed quests. Returns what cleared now. */
export async function evaluateQuests(ctx: ActionContext, now: Date) {
  const quests = await listQuests(ctx.supabase, ctx.user.id, { active: true });
  if (quests.length === 0) return { cleared: [] as { id: string; type: string; title: string; xp: number }[] };
  const { timezone } = await getSchedulerContext(ctx.supabase, ctx.user.id);
  const today = toLocalDate(now, timezone);
  const from = quests.map((q) => q.period_start).sort()[0];
  const bookedSince = quests.map((q) => q.created_at).sort()[0];
  const facts = await loadQuestFacts(ctx.supabase, ctx.user.id, from, today, bookedSince, now);
  const cleared: { id: string; type: string; title: string; xp: number }[] = [];
  for (const q of quests) {
    const r = evaluateQuest(
      { periodStart: q.period_start, periodEnd: q.period_end, createdAt: q.created_at },
      q.objectives.map((o) => ({ id: o.id, metric: o.metric, params: o.params, target: Number(o.target_value), completedAt: o.completed_at })),
      facts,
    );
    for (const u of r.updates) {
      const prev = q.objectives.find((o) => o.id === u.id)!;
      if (Number(prev.current_value) === u.current && prev.completed_at === u.completedAt) continue;
      const up = await ctx.supabase.from("quest_objectives").update({ current_value: u.current, completed_at: u.completedAt }).eq("id", u.id).eq("user_id", ctx.user.id);
      if (up.error) throw fromDbError(up.error);
    }
    if (r.cleared) {
      const up = await ctx.supabase.from("quests").update({ status: "cleared", cleared_at: facts.now }).eq("id", q.id).eq("user_id", ctx.user.id).eq("status", "active").select("id");
      if (up.error) throw fromDbError(up.error);
      if (up.data.length) cleared.push({ id: q.id, type: q.type, title: q.title, xp: q.reward_xp });
    }
  }
  return { cleared };
}

export async function swapObjective(ctx: ActionContext, objectiveId: string): Promise<void> {
  const quests = await listQuests(ctx.supabase, ctx.user.id, { active: true });
  const quest = quests.find((q) => q.type === "daily" && q.objectives.some((o) => o.id === objectiveId));
  if (!quest) throw new AppError("NOT_FOUND");
  const target = quest.objectives.find((o) => o.id === objectiveId)!;
  if (quest.swap_used || target.completed_at) throw new AppError("CONFLICT", "이 목표는 교체할 수 없습니다.");
  const spare = (quest.spare as { metric: ObjectiveDraft["metric"]; params: ObjectiveDraft["params"]; target_value: number }[]).map((s) => ({ metric: s.metric, params: s.params, target: Number(s.target_value) }));
  const next = nextSwap(quest.objectives.map((o) => ({ metric: o.metric, completed: !!o.completed_at })), spare);
  if (!next) throw new AppError("CONFLICT", "바꿀 수 있는 다른 목표가 없습니다.");
  const { error } = await ctx.supabase.rpc("swap_quest_objective", {
    p_objective_id: objectiveId,
    p_objective: obj(next.replacement) as unknown as Json,
    p_spare: next.spare.map((s) => obj(s)) as unknown as Json,
  });
  if (error) throw error.code === "23514" ? new AppError("CONFLICT", "이 목표는 교체할 수 없습니다.") : fromDbError(error);
}
