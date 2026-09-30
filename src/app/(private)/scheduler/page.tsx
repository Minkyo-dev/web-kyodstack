import type { Metadata } from "next";
import { requireUserOrRedirect } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SchedulerWorkspace } from "@/features/scheduler/components/scheduler-workspace";
import { WEEK_FETCH_BUFFER_DAYS } from "@/features/scheduler/domain/scheduler.constants";
import { listTemplates, listTodayTasks } from "@/features/scheduler/queries/task.queries";
import {
  getSchedulerContext,
  listBlocksInRange,
} from "@/features/scheduler/queries/schedule.queries";
import {
  addLocalDays,
  isLocalDateString,
  localDayRange,
  localWeek,
  todayLocalDate,
} from "@/features/scheduler/utils/timezone";

export const metadata: Metadata = { title: "스케줄러", robots: { index: false } };

export default async function SchedulerPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const user = await requireUserOrRedirect();
  const supabase = await createClient();
  const { week } = await searchParams;

  const context = await getSchedulerContext(supabase, user.id);
  const { timezone, settings } = context;

  const today = todayLocalDate(timezone);
  const anchor = week && isLocalDateString(week) ? week : today;
  const currentWeek = localWeek(anchor, timezone, settings.week_starts_on);

  // Bounded calendar read: selected week ± buffer (spec §50, §51).
  const rangeStart = localDayRange(
    addLocalDays(currentWeek.startDate, -WEEK_FETCH_BUFFER_DAYS, timezone),
    timezone,
  ).start;
  const rangeEnd = localDayRange(
    addLocalDays(currentWeek.endDate, WEEK_FETCH_BUFFER_DAYS - 1, timezone),
    timezone,
  ).end;
  const todayRange = localDayRange(today, timezone);

  const [todayTasks, blocks, templates] = await Promise.all([
    listTodayTasks(supabase, today, todayRange.start),
    listBlocksInRange(supabase, rangeStart, rangeEnd),
    listTemplates(supabase),
  ]);

  return (
    <SchedulerWorkspace
      context={context}
      today={today}
      todayRange={todayRange}
      week={currentWeek}
      todayTasks={todayTasks}
      blocks={blocks}
      templates={templates}
    />
  );
}
