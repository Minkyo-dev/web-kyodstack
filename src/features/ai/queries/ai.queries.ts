import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { fromDbError } from "@/lib/errors";
import type { Tables } from "@/types/database";
import type { WeeklyReviewOutput } from "../schemas/weekly-review.schema";

export type PendingRecommendation = Pick<
  Tables<"ai_recommendations">,
  "id" | "title" | "description" | "estimated_minutes" | "priority" | "rationale" | "recommendation_date"
> & {
  project: { id: string; name: string } | null;
  milestone: { id: string; name: string } | null;
};

const REC_SELECT =
  "id, title, description, estimated_minutes, priority, rationale, recommendation_date, project:projects!ai_recommendations_project_id_user_id_fkey(id, name), milestone:milestones!ai_recommendations_milestone_id_user_id_fkey(id, name)";

export async function listPendingRecommendations(
  supabase: SupabaseServerClient,
  filter: { date?: string; projectId?: string },
): Promise<PendingRecommendation[]> {
  let q = supabase.from("ai_recommendations").select(REC_SELECT).eq("status", "pending");
  if (filter.date) q = q.eq("recommendation_date", filter.date);
  if (filter.projectId) q = q.eq("project_id", filter.projectId);
  const { data, error } = await q.order("priority").order("created_at").limit(20);
  if (error) throw fromDbError(error);
  return data as PendingRecommendation[];
}

export type StoredWeeklyReview = Omit<
  Tables<"weekly_reviews">,
  "positives" | "issues" | "recommendations"
> & {
  positives: WeeklyReviewOutput["positives"];
  issues: WeeklyReviewOutput["issues"];
  recommendations: WeeklyReviewOutput["recommendations"];
};

export async function getWeeklyReview(
  supabase: SupabaseServerClient,
  weekStart: string,
): Promise<StoredWeeklyReview | null> {
  const { data, error } = await supabase.from("weekly_reviews").select("*").eq("week_start", weekStart).maybeSingle();
  if (error) throw fromDbError(error);
  return data as StoredWeeklyReview | null;
}
