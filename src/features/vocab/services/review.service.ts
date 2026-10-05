import "server-only";
import { AppError, fromDbError } from "@/lib/errors";
import { addLocalDays, localDayRange, todayLocalDate } from "@/features/scheduler/utils/timezone";
import { buildQueue, type Direction, type QueueCard } from "../domain/queue";
import { ALGO_VERSION, applyRating, type CardState, type FsrsState, type ReviewRating } from "../domain/srs";
import type { Cefr } from "../domain/word-mapping";
import { userTimezone } from "../queries/word.queries";
import type { ReviewScope } from "../schemas/review.schema";
import type { VocabCtx } from "./connection.service";
import { enqueueWriteback } from "./outbox.service";
import { getStudySettings } from "./settings.service";

export type ReviewWord = {
  id: string;
  term: string;
  meaning: string | null;
  pos: string | null;
  ipa: string | null;
  example: string | null;
  synonyms: string | null;
  note: string | null;
  topics: string[];
  cefr: Cefr | null;
  notionUrl: string | null;
};
export type ReviewItem = { cardId: string; direction: Direction; state: CardState; word: ReviewWord };

const CARD_COLUMNS = "id, word_id, direction, fsrs_state, due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, last_review, suspended_at, created_at";
const WORD_EMBED = "vocab_words!inner(id, term, meaning, pos, ipa, example, synonyms, note, topics, cefr, notion_url, deleted_at)";

type CardRow = {
  id: string;
  word_id: string;
  direction: string;
  fsrs_state: string;
  due: string;
  stability: number | null;
  difficulty: number | null;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  last_review: string | null;
};

export function rowToState(c: CardRow): CardState {
  return {
    fsrsState: c.fsrs_state as FsrsState,
    due: new Date(c.due).toISOString(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsedDays: c.elapsed_days,
    scheduledDays: c.scheduled_days,
    learningSteps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    lastReview: c.last_review ? new Date(c.last_review).toISOString() : null,
  };
}

function stateToRow(s: CardState) {
  return {
    fsrs_state: s.fsrsState,
    due: s.due,
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsedDays,
    scheduled_days: s.scheduledDays,
    learning_steps: s.learningSteps,
    reps: s.reps,
    lapses: s.lapses,
    last_review: s.lastReview,
  };
}

/** Today's numbers from the review log (local day): reviews done, new cards introduced, words touched. */
async function todayCounts(ctx: VocabCtx, dayStart: string) {
  const { data, error } = await ctx.supabase
    .from("vocab_reviews")
    .select("before, vocab_cards!inner(word_id)")
    .eq("user_id", ctx.user.id)
    .gte("reviewed_at", dayStart);
  if (error) throw fromDbError(error);
  let doneReviews = 0;
  let newIntroduced = 0;
  const wordIds = new Set<string>();
  for (const r of data) {
    if ((r.before as { fsrs_state?: string }).fsrs_state === "new") newIntroduced += 1;
    else doneReviews += 1;
    wordIds.add(r.vocab_cards.word_id);
  }
  return { doneReviews, newIntroduced, wordIds };
}

/** The session queue for a scope (spec §7.3), with each card's state and word. */
export async function loadReviewSession(ctx: VocabCtx, scope: ReviewScope): Promise<{ items: ReviewItem[]; retention: number }> {
  const [timezone, settings] = await Promise.all([userTimezone(ctx.supabase, ctx.user.id), getStudySettings(ctx.supabase, ctx.user.id)]);
  const today = todayLocalDate(timezone);
  const { start, end } = localDayRange(today, timezone);
  const counts = await todayCounts(ctx, start);

  const base = () => {
    let q = ctx.supabase
      .from("vocab_cards")
      .select(`${CARD_COLUMNS}, ${WORD_EMBED}`)
      .eq("user_id", ctx.user.id)
      .is("suspended_at", null)
      .is("vocab_words.deleted_at", null)
      .in("direction", settings.directions);
    if (scope.kind === "topic") q = q.contains("vocab_words.topics", [scope.topic]);
    return q;
  };
  // Fetch a little more than the caps: sibling bury drops some candidates.
  const [due, fresh] = await Promise.all([
    base().neq("fsrs_state", "new").lt("due", end).order("due").limit(Math.min(1000, settings.reviewsPerDay * 2)),
    base().eq("fsrs_state", "new").order("created_at").limit(Math.min(1000, settings.newPerDay * 2 + 10)),
  ]);
  if (due.error) throw fromDbError(due.error);
  if (fresh.error) throw fromDbError(fresh.error);
  const rows = [...due.data, ...fresh.data];
  const byId = new Map(rows.map((r) => [r.id, r]));

  const queue = buildQueue({
    cards: rows.map(
      (r): QueueCard => ({
        id: r.id,
        wordId: r.word_id,
        direction: r.direction as Direction,
        fsrsState: r.fsrs_state as FsrsState,
        due: r.due,
        suspended: false,
        wordCreatedAt: r.created_at,
      }),
    ),
    todayEnd: new Date(end),
    doneReviewsToday: counts.doneReviews,
    newIntroducedToday: counts.newIntroduced,
    reviewedTodayWordIds: counts.wordIds,
    settings,
  });
  const items = queue.map((q) => {
    const r = byId.get(q.id)!;
    const w = r.vocab_words;
    return {
      cardId: r.id,
      direction: q.direction,
      state: rowToState(r),
      word: {
        id: w.id,
        term: w.term,
        meaning: w.meaning,
        pos: w.pos,
        ipa: w.ipa,
        example: w.example,
        synonyms: w.synonyms,
        note: w.note,
        topics: w.topics,
        cefr: w.cefr as Cefr | null,
        notionUrl: w.notion_url,
      },
    };
  });
  return { items, retention: settings.desiredRetention };
}

async function loadOwnCard(ctx: VocabCtx, cardId: string) {
  const { data, error } = await ctx.supabase.from("vocab_cards").select(CARD_COLUMNS).eq("user_id", ctx.user.id).eq("id", cardId).maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new AppError("NOT_FOUND", "카드를 찾을 수 없어요.");
  return data;
}

function mapReviewError(error: { code?: string }): AppError {
  if (error.code === "V0409") return new AppError("CONFLICT", "다른 화면에서 이 카드를 먼저 복습했어요. 새로고침해 주세요.");
  return fromDbError(error);
}

/** One rating (spec §7.4): FSRS on the server's clock, applied atomically; then queue the Notion write-back. */
export async function reviewCard(
  ctx: VocabCtx,
  input: { cardId: string; rating: ReviewRating; durationMs: number; clientReviewId: string; expectedReps: number },
): Promise<{ state: CardState }> {
  const card = await loadOwnCard(ctx, input.cardId);
  const settings = await getStudySettings(ctx.supabase, ctx.user.id);
  const now = new Date();
  const after = applyRating(rowToState(card), input.rating, now, { retention: settings.desiredRetention });
  const { data, error } = await ctx.supabase.rpc("vocab_apply_review", {
    p_card_id: card.id,
    p_expected_reps: input.expectedReps,
    p_card: stateToRow(after),
    p_review: { client_review_id: input.clientReviewId, rating: input.rating, reviewed_at: now.toISOString(), duration_ms: input.durationMs, algo_version: ALGO_VERSION },
  });
  if (error) throw mapReviewError(error);
  await enqueueWriteback(ctx, [card.word_id]);
  if ((data as { status?: string } | null)?.status === "duplicate") return { state: rowToState(await loadOwnCard(ctx, card.id)) };
  return { state: after };
}

/** Undo the card's latest rating; returns the restored state. */
export async function undoReview(ctx: VocabCtx, cardId: string): Promise<{ state: CardState }> {
  const card = await loadOwnCard(ctx, cardId);
  const { error } = await ctx.supabase.rpc("vocab_undo_review", { p_card_id: card.id });
  if (error) throw error.code === "P0002" ? new AppError("NOT_FOUND", "되돌릴 복습이 없어요.") : fromDbError(error);
  await enqueueWriteback(ctx, [card.word_id]);
  return { state: rowToState(await loadOwnCard(ctx, card.id)) };
}

/** 학습 완료 on/off (spec §7.5): both cards at once; turning it off makes them due now. */
export async function setLearned(ctx: VocabCtx, wordId: string, learned: boolean): Promise<void> {
  const now = new Date().toISOString();
  const { data, error } = await ctx.supabase
    .from("vocab_cards")
    .update(learned ? { suspended_at: now } : { suspended_at: null, due: now })
    .eq("user_id", ctx.user.id)
    .eq("word_id", wordId)
    .select("id");
  if (error) throw fromDbError(error);
  if (data.length === 0) throw new AppError("NOT_FOUND", "단어를 찾을 수 없어요.");
  await enqueueWriteback(ctx, [wordId]);
}

/** Session summary: cards due tomorrow (local), for "내일 복습 N". */
export async function tomorrowDueCount(ctx: VocabCtx): Promise<number> {
  const timezone = await userTimezone(ctx.supabase, ctx.user.id);
  const { start, end } = localDayRange(addLocalDays(todayLocalDate(timezone), 1, timezone), timezone);
  const { count, error } = await ctx.supabase
    .from("vocab_cards")
    .select("id", { count: "exact", head: true })
    .eq("user_id", ctx.user.id)
    .is("suspended_at", null)
    .neq("fsrs_state", "new")
    .gte("due", start)
    .lt("due", end);
  if (error) throw fromDbError(error);
  return count ?? 0;
}

/** Cards due today per topic (spec §10 topic cards), not capped by the daily limits. */
export async function dueByTopic(ctx: VocabCtx): Promise<Map<string, number>> {
  const timezone = await userTimezone(ctx.supabase, ctx.user.id);
  const { end } = localDayRange(todayLocalDate(timezone), timezone);
  const { data, error } = await ctx.supabase
    .from("vocab_cards")
    .select("id, vocab_words!inner(topics, deleted_at)")
    .eq("user_id", ctx.user.id)
    .is("suspended_at", null)
    .neq("fsrs_state", "new")
    .lt("due", end)
    .is("vocab_words.deleted_at", null)
    .limit(1000);
  if (error) throw fromDbError(error);
  const counts = new Map<string, number>();
  for (const c of data) for (const t of c.vocab_words.topics) counts.set(t, (counts.get(t) ?? 0) + 1);
  return counts;
}
