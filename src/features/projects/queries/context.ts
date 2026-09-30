import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { getSchedulerContext } from "@/features/scheduler/queries/schedule.queries";
import { loadDurationGroups } from "@/features/scheduler/services/duration-groups.service";
import { listDomainRefs } from "@/features/classification/queries/classification.queries";
import { todayLocalDate } from "@/features/scheduler/utils/timezone";

/** What project pages need to estimate remaining work in the user's own terms. */
export async function loadProjectContext(supabase: SupabaseServerClient, userId: string) {
  const [context, groups, domains] = await Promise.all([
    getSchedulerContext(supabase, userId),
    loadDurationGroups(supabase, userId),
    listDomainRefs(supabase, userId),
  ]);
  return { ...context, groups, domains, today: todayLocalDate(context.timezone) };
}
