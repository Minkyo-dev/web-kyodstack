import "server-only";
import { fromDbError } from "@/lib/errors";
import { addLocalDays, localDayRange, toLocalDate, todayLocalDate } from "@/features/scheduler/utils/timezone";
import { dueBuckets, forecast, heatmapWeeks, recallRate, streak, type HeatCell } from "../domain/stats";
import { topicSummary, userTimezone, type TopicCount } from "../queries/word.queries";
import type { VocabCtx } from "./connection.service";
import { getStudySettings } from "./settings.service";

export const HEATMAP_WEEKS = 12;

/** Today's due buckets and 7-day forecast from the active, studied cards (spec §8.1). */
export async function loadDueOutlook(ctx: VocabCtx): Promise<{ buckets: ReturnType<typeof dueBuckets>; forecast: ReturnType<typeof forecast> }> {
  const timezone = await userTimezone(ctx.supabase, ctx.user.id);
  const today = todayLocalDate(timezone);
  const horizon = localDayRange(addLocalDays(today, 7, timezone), timezone).end;
  const { data, error } = await ctx.supabase
    .from("vocab_cards")
    .select("due, vocab_words!inner(deleted_at)")
    .eq("user_id", ctx.user.id)
    .is("suspended_at", null)
    .neq("fsrs_state", "new")
    .lt("due", horizon)
    .is("vocab_words.deleted_at", null)
    .order("due")
    .limit(1000);
  if (error) throw fromDbError(error);
  const dates = data.map((c) => toLocalDate(c.due, timezone));
  return { buckets: dueBuckets(dates, today), forecast: forecast(dates, today) };
}

export type VocabStats = {
  today: string;
  heatmap: HeatCell[][];
  streak: { current: number; best: number };
  recall30: number | null;
  reviews30: number;
  todayReviews: number;
  limits: { newPerDay: number; reviewsPerDay: number };
  cards: { fresh: number; learning: number; mature: number; learned: number };
  topics: TopicCount[];
};

/** Deterministic stats (spec §8.3): SQL aggregates per local day, then pure TS. */
export async function loadStats(ctx: VocabCtx): Promise<VocabStats> {
  const [timezone, settings] = await Promise.all([userTimezone(ctx.supabase, ctx.user.id), getStudySettings(ctx.supabase, ctx.user.id)]);
  const today = todayLocalDate(timezone);
  const since = localDayRange(addLocalDays(today, -7 * HEATMAP_WEEKS, timezone), timezone).start;
  const cardCount = (build: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => build(base()).then((r) => {
    if (r.error) throw fromDbError(r.error);
    return r.count ?? 0;
  });
  function base() {
    return ctx.supabase.from("vocab_cards").select("id, vocab_words!inner(deleted_at)", { count: "exact", head: true }).eq("user_id", ctx.user.id).is("vocab_words.deleted_at", null);
  }
  const [daysRes, fresh, learning, mature, learned, topics] = await Promise.all([
    ctx.supabase.rpc("vocab_review_days", { p_user_id: ctx.user.id, p_timezone: timezone, p_since: since }),
    cardCount((q) => q.eq("fsrs_state", "new").is("suspended_at", null)),
    cardCount((q) => q.neq("fsrs_state", "new").is("suspended_at", null).lt("scheduled_days", 21)),
    cardCount((q) => q.is("suspended_at", null).gte("scheduled_days", 21)),
    cardCount((q) => q.not("suspended_at", "is", null)),
    topicSummary(ctx.supabase, ctx.user.id),
  ]);
  if (daysRes.error) throw fromDbError(daysRes.error);
  const days = daysRes.data.map((d) => ({ date: d.local_date, reviews: d.reviews, studied: d.studied, studiedOk: d.studied_ok }));
  const last30 = days.filter((d) => d.date > addLocalDays(today, -30, timezone));
  return {
    today,
    heatmap: heatmapWeeks(days, today, HEATMAP_WEEKS),
    streak: streak(days, today),
    recall30: recallRate(last30),
    reviews30: last30.reduce((a, d) => a + d.reviews, 0),
    todayReviews: days.find((d) => d.date === today)?.reviews ?? 0,
    limits: { newPerDay: settings.newPerDay, reviewsPerDay: settings.reviewsPerDay },
    cards: { fresh, learning, mature, learned },
    topics: topics.topics,
  };
}
