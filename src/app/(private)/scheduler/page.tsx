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
  getActiveSession,
  getDailyReflection,
  listSessionsInRange,
} from "@/features/scheduler/queries/session.queries";
import { listTaskPlanActual } from "@/features/scheduler/queries/analytics.queries";
import { loadDurationProfiles } from "@/features/scheduler/services/duration-profile.service";
import { listProjectOptions } from "@/features/projects/queries/project.queries";
import { listPendingRecommendations } from "@/features/ai/queries/ai.queries";
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

  // Parallel initial read (spec §51).
  const [
    todayTasks,
    blocks,
    templates,
    sessions,
    activeSession,
    reflection,
    durationProfiles,
    projectOptions,
    recommendations,
  ] = await Promise.all([
    listTodayTasks(supabase, today, todayRange.start),
    listBlocksInRange(supabase, rangeStart, rangeEnd),
    listTemplates(supabase),
    listSessionsInRange(supabase, rangeStart, rangeEnd),
    getActiveSession(supabase),
    getDailyReflection(supabase, today),
    loadDurationProfiles(supabase, user.id),
    listProjectOptions(supabase),
    listPendingRecommendations(supabase, { date: today }),
  ]);

  // Plan vs actual only for tasks visible on this screen.
  const visibleTaskIds = [...new Set([...todayTasks.map((t) => t.id), ...blocks.map((b) => b.task_id)])];
  const planActual = await listTaskPlanActual(supabase, visibleTaskIds);

  return (
    <SchedulerWorkspace
      context={context}
      today={today}
      todayRange={todayRange}
      week={currentWeek}
      todayTasks={todayTasks}
      blocks={blocks}
      templates={templates}
      sessions={sessions}
      activeSession={activeSession}
      reflection={reflection}
      planActual={planActual}
      durationProfiles={durationProfiles}
      projectOptions={projectOptions}
      recommendations={recommendations}
    />
  );
}
