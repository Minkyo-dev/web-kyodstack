import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { fromDbError } from "@/lib/errors";
import type { SchedulerSettings } from "@/features/scheduler/domain/task.types";
import { addLocalDays, localDayRange, toLocalDate } from "@/features/scheduler/utils/timezone";
import { dailyCapacity } from "../utils/capacity";

/** Typical daily capacity for the capacity notice (D3 spec §3); same function as the progress page. */
export async function loadDailyCapacity(
  supabase: SupabaseServerClient,
  userId: string,
  now: Date,
  settings: Pick<SchedulerSettings, "planned_work_days" | "min_meaningful_minutes">,
  timezone: string,
): Promise<number | null> {
  const from = localDayRange(addLocalDays(toLocalDate(now, timezone), -28, timezone), timezone).start;
  const { data, error } = await supabase
    .from("work_sessions")
    .select("started_at, ended_at, pauses:work_session_pauses!work_session_pauses_session_id_user_id_fkey(paused_at, resumed_at)")
    .eq("user_id", userId)
    .gte("ended_at", from)
    .limit(5000);
  if (error) throw fromDbError(error);
  return dailyCapacity({
    sessions: data.map((s) => ({ ...s, pauses: s.pauses ?? [] })),
    plannedWorkDays: settings.planned_work_days,
    minMeaningfulMinutes: settings.min_meaningful_minutes,
    timezone,
    now: now.toISOString(),
  });
}
