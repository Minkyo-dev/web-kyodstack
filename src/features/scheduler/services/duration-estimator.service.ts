import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { SchedulerSettings, Task } from "../domain/task.types";
import { estimateDuration, type DurationEstimate } from "../utils/estimator";
import { loadDurationProfiles } from "./duration-profile.service";

export type { DurationEstimate };

/** Spec §26/§27: history first (template+complexity → template), then the base estimate. */
export async function recommendDuration(
  supabase: SupabaseServerClient,
  userId: string,
  task: Pick<Task, "user_estimated_minutes" | "complexity" | "template">,
  settings: SchedulerSettings,
): Promise<DurationEstimate> {
  const profiles = await loadDurationProfiles(supabase, userId);
  return estimateDuration(task, settings, profiles);
}
