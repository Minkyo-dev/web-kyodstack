import "server-only";
import { z } from "zod";
import { fromDbError } from "@/lib/errors";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { CEFR_LEVELS, STUDY_STATUSES } from "../domain/notion-schema";
import type { Cefr } from "../domain/word-mapping";
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
  notionStatus: string | null;
  notionUrl: string | null;
};

export const WORD_LIST_LIMIT = 500;

/** Live words (not deleted in Notion), newest first, filtered in SQL. */
export async function listWords(supabase: SupabaseServerClient, userId: string, filter: WordFilter): Promise<{ rows: WordListItem[]; truncated: boolean }> {
  let query = supabase
    .from("vocab_words")
    .select("id, term, meaning, pos, ipa, example, synonyms, note, topics, cefr, notion_status, notion_url")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(WORD_LIST_LIMIT + 1);
  if (filter.q) query = query.or(ilikeAny(["term", "meaning"], filter.q));
  if (filter.topic) query = query.contains("topics", [filter.topic]);
  if (filter.level) query = query.eq("cefr", filter.level);
  if (filter.status) query = query.eq("notion_status", filter.status);
  const { data, error } = await query;
  if (error) throw fromDbError(error);
  const rows = data.slice(0, WORD_LIST_LIMIT).map((w) => ({
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
    notionStatus: w.notion_status,
    notionUrl: w.notion_url,
  }));
  return { rows, truncated: data.length > WORD_LIST_LIMIT };
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
