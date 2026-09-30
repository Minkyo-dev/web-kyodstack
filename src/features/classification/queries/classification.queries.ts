import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { fromDbError } from "@/lib/errors";
import type { DomainRef } from "../domain/classification.types";

/** Explicit user scope: also correct under the service role (jobs). */
export async function listDomainRefs(supabase: SupabaseServerClient, userId: string): Promise<DomainRef[]> {
  const { data, error } = await supabase
    .from("practice_domains")
    .select("id, name, parent_id")
    .eq("user_id", userId)
    .order("name");
  if (error) throw fromDbError(error);
  return data;
}
