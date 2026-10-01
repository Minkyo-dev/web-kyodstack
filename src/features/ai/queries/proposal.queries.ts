import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { fromDbError } from "@/lib/errors";
import type { FeatureType, Proposal } from "../utils/classify";

/** Open AI proposals per task (F1 spec §2). */
export async function listOpenProposals(
  supabase: SupabaseServerClient,
  userId: string,
  taskIds: string[],
): Promise<Record<string, Proposal[]>> {
  const out: Record<string, Proposal[]> = {};
  for (let i = 0; i < taskIds.length; i += 200) {
    const { data, error } = await supabase
      .from("task_features")
      .select("id, task_id, feature_type, feature_value, confidence")
      .eq("user_id", userId)
      .eq("status", "proposed")
      .in("task_id", taskIds.slice(i, i + 200));
    if (error) throw fromDbError(error);
    for (const r of data) {
      (out[r.task_id] ??= []).push({
        id: r.id,
        featureType: r.feature_type as FeatureType,
        value: r.feature_value,
        confidence: r.confidence === null ? null : Number(r.confidence),
      });
    }
  }
  return out;
}
