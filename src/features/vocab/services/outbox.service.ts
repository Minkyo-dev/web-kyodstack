import "server-only";
import { AppError, fromDbError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { writebackFor, type CardSnapshot } from "../domain/status";
import type { FsrsState } from "../domain/srs";
import { OUTBOX_MAX_ATTEMPTS, outboxBackoffMs } from "../domain/sync";
import { wordToValues, type StudyStatus } from "../domain/word-mapping";
import { userTimezone } from "../queries/word.queries";
import { requireDatabase, withNotion, type VocabCtx } from "./connection.service";

type Payload = { status: StudyStatus; nextReview: string | null };

/**
 * After cards change: queue what Notion's 상태 / 다음 복습 should become (spec §6.4). Words whose Notion values
 * already match are skipped, and any stale pending write for them is dropped.
 */
export async function enqueueWriteback(ctx: VocabCtx, wordIds: string[]): Promise<void> {
  if (wordIds.length === 0) return;
  const timezone = await userTimezone(ctx.supabase, ctx.user.id);
  const { data, error } = await ctx.supabase
    .from("vocab_words")
    .select("id, notion_status, notion_next_review, vocab_cards(fsrs_state, due, suspended_at, scheduled_days)")
    .eq("user_id", ctx.user.id)
    .in("id", wordIds);
  if (error) throw fromDbError(error);
  for (const word of data) {
    const cards: CardSnapshot[] = word.vocab_cards.map((c) => ({
      fsrsState: c.fsrs_state as FsrsState,
      due: c.due,
      suspended: c.suspended_at !== null,
      scheduledDays: c.scheduled_days,
    }));
    const desired = writebackFor(cards, timezone);
    if (desired.status === word.notion_status && desired.nextReview === word.notion_next_review) {
      const { error: dropError } = await ctx.supabase.from("vocab_outbox").delete().eq("user_id", ctx.user.id).eq("word_id", word.id).is("done_at", null);
      if (dropError) throw fromDbError(dropError);
      continue;
    }
    const { error: rpcError } = await ctx.supabase.rpc("vocab_enqueue_writeback", { p_user_id: ctx.user.id, p_word_id: word.id, p_payload: desired });
    if (rpcError) throw fromDbError(rpcError);
  }
}

/** Writes due outbox rows to Notion (≈3/s through the SDK). Backoff on failure; a gone page closes its row. */
export async function flushOutbox(ctx: VocabCtx, limit: number): Promise<{ written: number; failed: number }> {
  const { data: rows, error } = await ctx.supabase
    .from("vocab_outbox")
    .select("id, word_id, payload, attempts, next_attempt_at, vocab_words(notion_page_id)")
    .eq("user_id", ctx.user.id)
    .is("done_at", null)
    .lt("attempts", OUTBOX_MAX_ATTEMPTS)
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at")
    .limit(limit);
  if (error) throw fromDbError(error);
  if (rows.length === 0) return { written: 0, failed: 0 };
  const result = { written: 0, failed: 0 };
  await withNotion(ctx, async (gateway, auth, conn) => {
    const { propertyIds } = requireDatabase(conn);
    for (const row of rows) {
      const payload = row.payload as Payload;
      const pageId = row.vocab_words?.notion_page_id;
      // Close only the version we wrote: a newer enqueue resets next_attempt_at and keeps its row open.
      const close = (extra: Record<string, unknown>) =>
        ctx.supabase.from("vocab_outbox").update(extra).eq("user_id", ctx.user.id).eq("id", row.id).eq("next_attempt_at", row.next_attempt_at);
      try {
        if (!pageId) throw new AppError("NOT_FOUND");
        await gateway.updatePage(auth, pageId, wordToValues({ status: payload.status, nextReview: payload.nextReview }, propertyIds));
        await close({ done_at: new Date().toISOString(), last_error_code: null });
        const { error: mirrorError } = await ctx.supabase
          .from("vocab_words")
          .update({ notion_status: payload.status, notion_next_review: payload.nextReview })
          .eq("user_id", ctx.user.id)
          .eq("id", row.word_id);
        if (mirrorError) throw fromDbError(mirrorError);
        result.written += 1;
      } catch (err) {
        const code = err instanceof AppError ? err.code : "INTERNAL_ERROR";
        if (code === "NOTION_REAUTH_REQUIRED") throw err;
        result.failed += 1;
        if (code === "NOT_FOUND") {
          await close({ done_at: new Date().toISOString(), last_error_code: code });
          continue;
        }
        await close({
          attempts: row.attempts + 1,
          next_attempt_at: new Date(Date.now() + outboxBackoffMs(row.attempts)).toISOString(),
          last_error_code: code,
        });
        log({ action: "vocab.outbox.write", userId: ctx.user.id, success: false, errorCode: code });
      }
    }
  });
  return result;
}

export async function pendingWritebacks(ctx: VocabCtx): Promise<{ pending: number; stuck: number }> {
  const { data, error } = await ctx.supabase.from("vocab_outbox").select("attempts").eq("user_id", ctx.user.id).is("done_at", null);
  if (error) throw fromDbError(error);
  return { pending: data.length, stuck: data.filter((r) => r.attempts >= OUTBOX_MAX_ATTEMPTS).length };
}

/** [다시 시도]: give stuck write-backs another round now. */
export async function retryStuckWritebacks(ctx: VocabCtx): Promise<void> {
  const { error } = await ctx.supabase
    .from("vocab_outbox")
    .update({ attempts: 0, next_attempt_at: new Date().toISOString() })
    .eq("user_id", ctx.user.id)
    .is("done_at", null);
  if (error) throw fromDbError(error);
}
