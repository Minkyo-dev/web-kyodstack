import "server-only";
import { AppError, fromDbError } from "@/lib/errors";
import type { NotionPage } from "@/lib/notion/types";
import type { Tables } from "@/types/database";
import type { PropertyIds } from "../domain/notion-schema";
import { changedFields, pageToWordFields, wordToValues, type Cefr, type WordFields } from "../domain/word-mapping";
import { escapeLike } from "../utils/escape-like";
import { requireDatabase, withNotion, type VocabCtx } from "./connection.service";

export type WordRow = Tables<"vocab_words">;

const WORD_COLUMNS = "id, notion_page_id, term, meaning, pos, ipa, example, synonyms, note, topics, cefr";

/** Notion pages → mirror rows (and their cards) through the one atomic writer, vocab_upsert_words. */
export async function upsertPages(ctx: VocabCtx, pages: NotionPage[], ids: PropertyIds): Promise<WordRow[]> {
  if (pages.length === 0) return [];
  const rows = pages.map((page) => {
    const { notionStatus, notionNextReview, ...fields } = pageToWordFields(page, ids);
    return {
      ...fields,
      notion_status: notionStatus,
      notion_next_review: notionNextReview,
      notion_page_id: page.id,
      notion_url: page.url,
      notion_last_edited_at: page.lastEditedTime,
    };
  });
  const { data, error } = await ctx.supabase.rpc("vocab_upsert_words", { p_user_id: ctx.user.id, p_rows: rows });
  if (error) throw fromDbError(error);
  return data ?? [];
}

function toFields(row: Pick<WordRow, "term" | "meaning" | "pos" | "ipa" | "example" | "synonyms" | "note" | "topics" | "cefr">): WordFields {
  return {
    term: row.term,
    meaning: row.meaning,
    pos: row.pos,
    ipa: row.ipa,
    example: row.example,
    synonyms: row.synonyms,
    note: row.note,
    topics: row.topics,
    cefr: row.cefr as Cefr | null,
  };
}

async function loadOwnWord(ctx: VocabCtx, wordId: string) {
  const { data, error } = await ctx.supabase
    .from("vocab_words")
    .select(WORD_COLUMNS)
    .eq("user_id", ctx.user.id)
    .eq("id", wordId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new AppError("NOT_FOUND", "단어를 찾을 수 없어요.");
  return data;
}

const isGone = (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND";

/** Write-through (spec §6.1): Notion first, then the mirror from the page Notion returned. */
export async function createWord(ctx: VocabCtx, fields: WordFields): Promise<{ id: string }> {
  const { data: dupes, error } = await ctx.supabase
    .from("vocab_words")
    .select("id")
    .eq("user_id", ctx.user.id)
    .is("deleted_at", null)
    .ilike("term", escapeLike(fields.term))
    .limit(1);
  if (error) throw fromDbError(error);
  if (dupes.length > 0) throw new AppError("CONFLICT", "이미 있는 단어예요.");
  return withNotion(ctx, async (gateway, auth, conn) => {
    const { dataSourceId, propertyIds } = requireDatabase(conn);
    const page = await gateway.createPage(auth, dataSourceId, wordToValues({ ...fields, status: "새 단어" }, propertyIds));
    const [row] = await upsertPages(ctx, [page], propertyIds);
    return { id: row.id };
  });
}

/** Sends only the changed properties, so concurrent edits of other fields in Notion survive. */
export async function updateWord(ctx: VocabCtx, wordId: string, patch: Partial<WordFields>): Promise<void> {
  const row = await loadOwnWord(ctx, wordId);
  const changes = changedFields(toFields(row), patch);
  if (Object.keys(changes).length === 0) return;
  await withNotion(ctx, async (gateway, auth, conn) => {
    const { propertyIds } = requireDatabase(conn);
    try {
      const page = await gateway.updatePage(auth, row.notion_page_id, wordToValues(changes, propertyIds));
      await upsertPages(ctx, [page], propertyIds);
    } catch (error) {
      if (!isGone(error)) throw error;
      await markDeleted(ctx, [wordId]);
      throw new AppError("NOT_FOUND", "Notion에서 삭제된 단어예요.");
    }
  });
}

/** Moves the page to Notion's trash (already gone counts as done), then removes the mirror row and its cards. */
export async function deleteWord(ctx: VocabCtx, wordId: string): Promise<void> {
  const row = await loadOwnWord(ctx, wordId);
  await withNotion(ctx, async (gateway, auth) => {
    try {
      await gateway.trashPage(auth, row.notion_page_id);
    } catch (error) {
      if (!isGone(error)) throw error;
    }
  });
  const { error } = await ctx.supabase.from("vocab_words").delete().eq("user_id", ctx.user.id).eq("id", wordId);
  if (error) throw fromDbError(error);
}

export async function markDeleted(ctx: VocabCtx, wordIds: string[]): Promise<void> {
  for (let i = 0; i < wordIds.length; i += 100) {
    const { error } = await ctx.supabase
      .from("vocab_words")
      .update({ deleted_at: new Date().toISOString() })
      .eq("user_id", ctx.user.id)
      .in("id", wordIds.slice(i, i + 100));
    if (error) throw fromDbError(error);
  }
}
