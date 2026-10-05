import "server-only";
import { z } from "zod";
import { fromDbError } from "@/lib/errors";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { CEFR_LEVELS, STUDY_STATUSES } from "../domain/notion-schema";
import type { FsrsState } from "../domain/srs";
import { deriveStatus, isMature, nextReviewDate } from "../domain/status";
import type { Cefr, StudyStatus } from "../domain/word-mapping";
import { ilikeAny } from "../utils/escape-like";

export const wordFilterSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  topic: z.string().trim().max(50).optional().catch(undefined),
  level: z.enum(CEFR_LEVELS).optional().catch(undefined),
  status: z.enum(STUDY_STATUSES).optional().catch(undefined),
});
export type WordFilter = z.infer<typeof wordFilterSchema>;

export type WordListItem = {
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
  /** From the cards (the app's truth); Notion's 상태 follows through the outbox. */
  status: StudyStatus;
  nextReview: string | null;
  mature: boolean;
  notionUrl: string | null;
};

export const WORD_LIST_LIMIT = 500;

/** Live words (not deleted in Notion), newest first. Text, topic and level filter in SQL; status from the cards. */
export async function listWords(
  supabase: SupabaseServerClient,
  userId: string,
  filter: WordFilter,
  timezone: string,
): Promise<{ rows: WordListItem[]; truncated: boolean }> {
  let query = supabase
    .from("vocab_words")
    .select("id, term, meaning, pos, ipa, example, synonyms, note, topics, cefr, notion_url, vocab_cards(fsrs_state, due, suspended_at, scheduled_days)")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(WORD_LIST_LIMIT + 1);
  if (filter.q) query = query.or(ilikeAny(["term", "meaning"], filter.q));
  if (filter.topic) query = query.contains("topics", [filter.topic]);
  if (filter.level) query = query.eq("cefr", filter.level);
  const { data, error } = await query;
  if (error) throw fromDbError(error);
  const rows = data.slice(0, WORD_LIST_LIMIT).map((w) => {
    const cards = w.vocab_cards.map((c) => ({ fsrsState: c.fsrs_state as FsrsState, due: c.due, suspended: c.suspended_at !== null, scheduledDays: c.scheduled_days }));
    return {
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
      status: deriveStatus(cards),
      nextReview: nextReviewDate(cards, timezone),
      mature: isMature(cards),
      notionUrl: w.notion_url,
    };
  });
  return { rows: filter.status ? rows.filter((r) => r.status === filter.status) : rows, truncated: data.length > WORD_LIST_LIMIT };
}

export type TopicCount = { name: string; count: number };

/** Topic → live word count, most used first; plus the total. */
export async function topicSummary(supabase: SupabaseServerClient, userId: string): Promise<{ total: number; topics: TopicCount[] }> {
  const { data, error } = await supabase.from("vocab_words").select("topics").eq("user_id", userId).is("deleted_at", null);
  if (error) throw fromDbError(error);
  const counts = new Map<string, number>();
  for (const { topics } of data) for (const t of topics) counts.set(t, (counts.get(t) ?? 0) + 1);
  const topics = [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko"));
  return { total: data.length, topics };
}

/** The profile timezone (default America/Toronto) for local-time labels. */
export async function userTimezone(supabase: SupabaseServerClient, userId: string): Promise<string> {
  const { data, error } = await supabase.from("profiles").select("timezone").eq("id", userId).maybeSingle();
  if (error) throw fromDbError(error);
  return data?.timezone ?? "America/Toronto";
}
