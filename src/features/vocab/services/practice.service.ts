import "server-only";
import { AppError, fromDbError } from "@/lib/errors";
import { callAi } from "@/features/ai/services/budget.service";
import { addLocalDays, localDayRange, todayLocalDate } from "@/features/scheduler/utils/timezone";
import { PracticeFeedbackSchema, PracticeGenerateSchema, type PracticeFeedback } from "../ai/practice.schema";
import {
  PRACTICE_FEEDBACK_PROMPT_VERSION, PRACTICE_FEEDBACK_SYSTEM, PRACTICE_FEEDBACK_TASK, PRACTICE_GEN_PROMPT_VERSION, PRACTICE_GEN_SYSTEM,
  PRACTICE_GEN_TASK, practiceFeedbackPrompt, practiceGeneratePrompt,
} from "../ai/practice.prompt";
import { MAX_ATTEMPTS, pickPracticeWords, refsFor, validateGenerated, type PracticeSource, type PracticeWord } from "../domain/practice";
import type { Cefr } from "../domain/word-mapping";
import { userTimezone } from "../queries/word.queries";
import type { VocabCtx } from "./connection.service";

export type PracticeRequest = { source: PracticeSource; topic?: string; wordIds?: string[]; size: number; cefr: Cefr };
export type PracticeAttempt = { id: string; answer: string; feedback: PracticeFeedback; createdAt: string };
export type PracticeItemView = {
  id: string;
  position: number;
  promptKo: string;
  hintKo: string | null;
  targets: { id: string; term: string; meaning: string | null }[];
  attempts: PracticeAttempt[];
};
export type PracticeSessionView = { id: string; cefr: Cefr; source: PracticeSource; sourceRef: string | null; createdAt: string; items: PracticeItemView[] };

const HARD_LAPSES = 2;
const HARD_AGAIN_DAYS = 7;

async function wordIdsFromReviews(ctx: VocabCtx, since: string, againOnly: boolean): Promise<string[]> {
  let q = ctx.supabase.from("vocab_reviews").select("vocab_cards!inner(word_id)").eq("user_id", ctx.user.id).gte("reviewed_at", since).limit(1000);
  if (againOnly) q = q.eq("rating", 1);
  const { data, error } = await q;
  if (error) throw fromDbError(error);
  return [...new Set(data.map((r) => r.vocab_cards.word_id))];
}

/** Words a source offers (spec §9.3): a topic, today's reviews, hard words (lapses ≥ 2 or Again in 7 days), or a pick. */
export async function practiceCandidates(ctx: VocabCtx, req: Pick<PracticeRequest, "source" | "topic" | "wordIds">): Promise<PracticeWord[]> {
  let ids: string[] | null = null;
  if (req.source === "manual") ids = req.wordIds ?? [];
  if (req.source === "reviewed_today" || req.source === "hard") {
    const timezone = await userTimezone(ctx.supabase, ctx.user.id);
    const today = todayLocalDate(timezone);
    if (req.source === "reviewed_today") ids = await wordIdsFromReviews(ctx, localDayRange(today, timezone).start, false);
    else {
      const again = await wordIdsFromReviews(ctx, localDayRange(addLocalDays(today, -HARD_AGAIN_DAYS, timezone), timezone).start, true);
      const { data, error } = await ctx.supabase.from("vocab_cards").select("word_id").eq("user_id", ctx.user.id).gte("lapses", HARD_LAPSES).limit(1000);
      if (error) throw fromDbError(error);
      ids = [...new Set([...again, ...data.map((c) => c.word_id)])];
    }
  }
  if (ids && ids.length === 0) return [];
  let q = ctx.supabase.from("vocab_words").select("id, term, meaning, pos, vocab_cards(lapses)").eq("user_id", ctx.user.id).is("deleted_at", null).limit(500);
  if (ids) q = q.in("id", ids.slice(0, 500));
  if (req.source === "topic" && req.topic) q = q.contains("topics", [req.topic]);
  const { data, error } = await q;
  if (error) throw fromDbError(error);
  return data.map((w) => ({ id: w.id, term: w.term, meaning: w.meaning, pos: w.pos, lapses: Math.max(0, ...w.vocab_cards.map((c) => c.lapses)) }));
}

/** Code picks the words; one AI call writes the sentences; the guard validates; one RPC saves session + items. */
export async function createPracticeSession(ctx: VocabCtx, req: PracticeRequest): Promise<{ id: string }> {
  const words = pickPracticeWords(await practiceCandidates(ctx, req), { source: req.source, size: req.size });
  if (words.length === 0) throw new AppError("VALIDATION_ERROR", "이 조건으로 연습할 단어가 없어요.");
  const refs = refsFor(words);
  const { data, model } = await callAi(ctx, "vocab.practice.generate", {
    task: PRACTICE_GEN_TASK,
    system: PRACTICE_GEN_SYSTEM,
    prompt: practiceGeneratePrompt(req.cefr, refs),
    schema: PracticeGenerateSchema,
    effort: "medium",
  });
  const items = validateGenerated(refs, data.items, req.cefr);
  const { data: id, error } = await ctx.supabase.rpc("vocab_create_practice", {
    p_user_id: ctx.user.id,
    p_cefr: req.cefr,
    p_source: req.source,
    // Generated RPC args are non-null; "" means no source reference and reads back as null.
    p_source_ref: req.source === "topic" ? (req.topic ?? "") : "",
    p_word_ids: words.map((w) => w.id),
    p_prompt_version: PRACTICE_GEN_PROMPT_VERSION,
    p_model: model,
    p_items: items.map((i) => ({ target_word_ids: i.targetWordIds, prompt_ko: i.promptKo, hint_ko: i.hintKo ?? "" })),
  });
  if (error) throw fromDbError(error);
  return { id: id as string };
}

export async function loadPracticeSession(ctx: VocabCtx, sessionId: string): Promise<PracticeSessionView> {
  const { data: s, error } = await ctx.supabase
    .from("vocab_practice_sessions")
    .select("id, cefr, source, source_ref, created_at, word_ids, vocab_practice_items(id, position, prompt_ko, hint_ko, target_word_ids, vocab_practice_attempts(id, answer, feedback, created_at))")
    .eq("user_id", ctx.user.id)
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!s) throw new AppError("NOT_FOUND", "연습을 찾을 수 없어요.");
  const { data: words, error: wordsError } = await ctx.supabase.from("vocab_words").select("id, term, meaning").eq("user_id", ctx.user.id).in("id", s.word_ids);
  if (wordsError) throw fromDbError(wordsError);
  const byId = new Map(words.map((w) => [w.id, w]));
  return {
    id: s.id,
    cefr: s.cefr as Cefr,
    source: s.source as PracticeSource,
    sourceRef: s.source_ref || null,
    createdAt: s.created_at,
    items: [...s.vocab_practice_items]
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        id: item.id,
        position: item.position,
        promptKo: item.prompt_ko,
        hintKo: item.hint_ko,
        targets: item.target_word_ids.map((id) => byId.get(id) ?? { id, term: "(삭제된 단어)", meaning: null }),
        attempts: [...item.vocab_practice_attempts]
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .map((a) => ({ id: a.id, answer: a.answer, feedback: a.feedback as PracticeFeedback, createdAt: a.created_at })),
      })),
  };
}

/** One attempt (≤ 3 per item): one budgeted AI call, the validated feedback saved with the answer. */
export async function submitAttempt(ctx: VocabCtx, itemId: string, answer: string): Promise<PracticeAttempt> {
  const { data: item, error } = await ctx.supabase
    .from("vocab_practice_items")
    .select("id, prompt_ko, target_word_ids, vocab_practice_sessions!inner(cefr), vocab_practice_attempts(id)")
    .eq("user_id", ctx.user.id)
    .eq("id", itemId)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!item) throw new AppError("NOT_FOUND", "연습 문장을 찾을 수 없어요.");
  if (item.vocab_practice_attempts.length >= MAX_ATTEMPTS) throw new AppError("VALIDATION_ERROR", `한 문장은 ${MAX_ATTEMPTS}번까지 고쳐 쓸 수 있어요.`);
  const { data: targets, error: targetError } = await ctx.supabase.from("vocab_words").select("term, meaning").eq("user_id", ctx.user.id).in("id", item.target_word_ids);
  if (targetError) throw fromDbError(targetError);
  const level = item.vocab_practice_sessions.cefr as Cefr;
  const { data: feedback, model } = await callAi(ctx, "vocab.practice.feedback", {
    task: PRACTICE_FEEDBACK_TASK,
    system: PRACTICE_FEEDBACK_SYSTEM,
    prompt: practiceFeedbackPrompt({ level, promptKo: item.prompt_ko, targets, answer }),
    schema: PracticeFeedbackSchema,
    effort: "medium",
  });
  const { data: saved, error: saveError } = await ctx.supabase
    .from("vocab_practice_attempts")
    .insert({ item_id: item.id, user_id: ctx.user.id, answer, feedback, prompt_version: PRACTICE_FEEDBACK_PROMPT_VERSION, model })
    .select("id, created_at")
    .single();
  if (saveError) throw saveError.code === "23514" ? new AppError("VALIDATION_ERROR", `한 문장은 ${MAX_ATTEMPTS}번까지 고쳐 쓸 수 있어요.`) : fromDbError(saveError);
  return { id: saved.id, answer, feedback, createdAt: saved.created_at };
}

export type PracticeSessionSummary = { id: string; cefr: Cefr; source: PracticeSource; sourceRef: string | null; createdAt: string; items: number; answered: number };

export async function listPracticeSessions(ctx: VocabCtx, limit = 20): Promise<PracticeSessionSummary[]> {
  const { data, error } = await ctx.supabase
    .from("vocab_practice_sessions")
    .select("id, cefr, source, source_ref, created_at, vocab_practice_items(id, vocab_practice_attempts(id))")
    .eq("user_id", ctx.user.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw fromDbError(error);
  return data.map((s) => ({
    id: s.id,
    cefr: s.cefr as Cefr,
    source: s.source as PracticeSource,
    sourceRef: s.source_ref || null,
    createdAt: s.created_at,
    items: s.vocab_practice_items.length,
    answered: s.vocab_practice_items.filter((i) => i.vocab_practice_attempts.length > 0).length,
  }));
}
