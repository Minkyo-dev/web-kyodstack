import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { AppError, fromDbError } from "@/lib/errors";
import type { CalendarBlock } from "../domain/schedule.types";
import type { SchedulerContext } from "../domain/task.types";
import { BLOCK_SELECT } from "./select";

/** Non-cancelled blocks overlapping [startIso, endIso). Always bounded (spec §50). */
export async function listBlocksInRange(
  supabase: SupabaseServerClient,
  startIso: string,
  endIso: string,
): Promise<CalendarBlock[]> {
  const { data, error } = await supabase
    .from("schedule_blocks")
    .select(BLOCK_SELECT)
    .neq("status", "cancelled")
    .lt("starts_at", endIso)
    .gt("ends_at", startIso)
    .order("starts_at");
  if (error) throw fromDbError(error);
  return data as unknown as CalendarBlock[];
}

export async function getSchedulerContext(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<SchedulerContext> {
  const [profile, settings] = await Promise.all([
    supabase.from("profiles").select("timezone").eq("id", userId).single(),
    supabase
      .from("scheduler_settings")
      .select(
        "week_starts_on, workday_start, workday_end, slot_minutes, min_block_minutes, max_focus_block_minutes, auto_schedule_mode",
      )
      .eq("user_id", userId)
      .single(),
  ]);
  if (profile.error) throw fromDbError(profile.error);
  if (settings.error) throw fromDbError(settings.error);
  if (!profile.data || !settings.data) throw new AppError("NOT_FOUND");
  return { timezone: profile.data.timezone, settings: settings.data };
}
