import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { getSchedulerContext } from "@/features/scheduler/queries/schedule.queries";
import { loadDurationProfiles } from "@/features/scheduler/services/duration-profile.service";
import { todayLocalDate } from "@/features/scheduler/utils/timezone";

/** What project pages need to estimate remaining work in the user's own terms. */
export async function loadProjectContext(supabase: SupabaseServerClient, userId: string) {
  const [context, profiles] = await Promise.all([
    getSchedulerContext(supabase, userId),
    loadDurationProfiles(supabase),
  ]);
  return { ...context, profiles, today: todayLocalDate(context.timezone) };
}
