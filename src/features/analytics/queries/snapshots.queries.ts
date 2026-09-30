import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { fromDbError } from "@/lib/errors";
import type { StatType } from "../domain/stats.types";

export type SnapshotRow = {
  computed_on: string;
  stat_type: StatType;
  scope: string;
  value: number | null;
  formula_version: string;
};

/** Daily snapshots since a local date, oldest first (trend lines). */
export async function listSnapshots(
  supabase: SupabaseServerClient,
  userId: string,
  sinceDate: string,
): Promise<SnapshotRow[]> {
  const { data, error } = await supabase
    .from("stat_snapshots")
    .select("computed_on, stat_type, scope, value, formula_version")
    .eq("user_id", userId)
    .gte("computed_on", sinceDate)
    .order("computed_on");
  if (error) throw fromDbError(error);
  return data.map((r) => ({ ...r, stat_type: r.stat_type as StatType, value: r.value === null ? null : Number(r.value) }));
}
