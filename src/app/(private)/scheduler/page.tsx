import type { Metadata } from "next";
import { requireUserOrRedirect } from "@/lib/auth";
import { listMissionOptions } from "@/features/direction/queries/direction.queries";
import { createClient } from "@/lib/supabase/server";
import { SchedulerWorkspace } from "@/features/scheduler/components/scheduler-workspace";
import { WEEK_FETCH_BUFFER_DAYS } from "@/features/scheduler/domain/scheduler.constants";
import { countCompletedInRange, listTemplates, listTodayTasks } from "@/features/scheduler/queries/task.queries";
import { loadDailyCapacity } from "@/features/analytics/queries/capacity.queries";
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
import { loadDurationGroups } from "@/features/scheduler/services/duration-groups.service";
import {
  listDomainRefs,
  listTags,
  listTemplatesWithClassification,
} from "@/features/classification/queries/classification.queries";
import { z } from "zod";
import { markMissedBlocks } from "@/features/scheduler/services/scheduling.service";
import { listProjectOptions } from "@/features/projects/queries/project.queries";
import { listPendingRecommendations } from "@/features/ai/queries/ai.queries";
import { listOpenProposals } from "@/features/ai/queries/proposal.queries";
import { getPlayerProfile } from "@/features/gamification/queries/xp.queries";
import { listQuests } from "@/features/gamification/queries/quest.queries";
import { ensureQuests } from "@/features/gamification/services/quest.service";
import { toQuestViews, type QuestView } from "@/features/gamification/utils/quest-view";
import { QuestPanel } from "@/features/gamification/components/quest-panel";
import { log } from "@/lib/logger";
import { isMonthKey, localMonth } from "@/features/scheduler/utils/month";
import { HabitPanel } from "@/features/direction/components/habit-panel";
import { listTodayHabits } from "@/features/direction/queries/habit.queries";
import { syncFocusChecks } from "@/features/direction/services/habit.service";
import type { HabitToday } from "@/features/direction/domain/direction.types";
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
  searchParams: Promise<{ week?: string; tags?: string; view?: string; month?: string }>;
}) {
  const user = await requireUserOrRedirect();
  const supabase = await createClient();
  const { week, tags: tagsParam, view, month: monthParam } = await searchParams;
  const tagFilter = (tagsParam ?? "").split(",").filter((id) => z.uuid().safeParse(id).success);

  const context = await getSchedulerContext(supabase, user.id);
  const { timezone, settings } = context;
  // Ended blocks without a session become missed before we read them (ADR 0012).
  await markMissedBlocks(supabase, user.id);

  const today = todayLocalDate(timezone);
  const anchor = week && isLocalDateString(week) ? week : today;
  const currentWeek = localWeek(anchor, timezone, settings.week_starts_on);

  // Month view (?view=month&month=yyyy-MM): whole weeks around the month; otherwise the week view.
  const monthView = view === "month" ? localMonth(monthParam && isMonthKey(monthParam) ? monthParam : today.slice(0, 7), settings.week_starts_on) : null;

  // Bounded calendar read: selected week ± buffer, or the month grid (spec §50, §51).
  const rangeStart = localDayRange(
    monthView ? monthView.startDate : addLocalDays(currentWeek.startDate, -WEEK_FETCH_BUFFER_DAYS, timezone),
    timezone,
  ).start;
  const rangeEnd = localDayRange(
    monthView ? addLocalDays(monthView.endDate, -1, timezone) : addLocalDays(currentWeek.endDate, WEEK_FETCH_BUFFER_DAYS - 1, timezone),
    timezone,
  ).end;
  const todayRange = localDayRange(today, timezone);
  const tomorrowRange = localDayRange(addLocalDays(today, 1, timezone), timezone);
  const weekRange = {
    start: localDayRange(currentWeek.startDate, timezone).start,
    end: localDayRange(currentWeek.endDate, timezone).start,
  };

  // Parallel initial read (spec §51).
  const [
    todayTasks,
    blocks,
    templates,
    sessions,
    activeSession,
    reflection,
    durationGroups,
    domains,
    tags,
    classifiedTemplates,
    capacity,
    weekCompleted,
    nearBlocks,
    projectOptions,
    recommendations,
    missionOptions,
  ] = await Promise.all([
    listTodayTasks(supabase, today, todayRange.start),
    listBlocksInRange(supabase, rangeStart, rangeEnd),
    listTemplates(supabase),
    listSessionsInRange(supabase, rangeStart, rangeEnd),
    getActiveSession(supabase),
    getDailyReflection(supabase, today),
    loadDurationGroups(supabase, user.id),
    listDomainRefs(supabase, user.id),
    listTags(supabase, user.id),
    listTemplatesWithClassification(supabase, user.id),
    loadDailyCapacity(supabase, user.id, new Date(), settings, timezone),
    countCompletedInRange(supabase, weekRange.start, weekRange.end),
    // Today and tomorrow, whatever week is displayed (capacity notice).
    listBlocksInRange(supabase, todayRange.start, tomorrowRange.end),
    listProjectOptions(supabase),
    listPendingRecommendations(supabase, { date: today }),
    listMissionOptions(supabase, user.id),
  ]);

  // Plan vs actual only for tasks visible on this screen.
  const visibleTaskIds = [...new Set([...todayTasks.map((t) => t.id), ...blocks.map((b) => b.task_id)])];
  // Habits (G2) and quests (E2) are recorded/generated lazily here; a failure only hides that panel.
  const loadHabits = async (): Promise<HabitToday[]> => {
    try {
      await syncFocusChecks({ user, supabase }, [today]);
      return await listTodayHabits(supabase, user.id, today, timezone);
    } catch (error) {
      log({ action: "habits.today", userId: user.id, success: false, errorCode: "INTERNAL_ERROR", detail: String(error) });
      return [];
    }
  };
  const loadQuests = async (): Promise<QuestView[]> => {
    const profile = await getPlayerProfile(supabase, user.id);
    if (!profile?.gamification_enabled) return [];
    try {
      await ensureQuests({ user, supabase }, new Date());
      const rows = await listQuests(supabase, user.id, { visibleOn: today });
      return toQuestViews(rows, Object.fromEntries(domains.map((d) => [d.id, d.name])));
    } catch (error) {
      log({ action: "quests.ensure", userId: user.id, success: false, errorCode: "INTERNAL_ERROR", detail: String(error) });
      return [];
    }
  };
  // Independent reads in parallel (spec §51).
  const [planActual, proposals, habits, quests] = await Promise.all([
    listTaskPlanActual(supabase, visibleTaskIds),
    listOpenProposals(supabase, user.id, visibleTaskIds),
    loadHabits(),
    loadQuests(),
  ]);

  return (
    <SchedulerWorkspace
      context={context}
      today={today}
      todayRange={todayRange}
      week={currentWeek}
      monthView={monthView}
      todayTasks={todayTasks}
      blocks={blocks}
      templates={templates}
      sessions={sessions}
      activeSession={activeSession}
      reflection={reflection}
      planActual={planActual}
      durationGroups={durationGroups}
      domains={domains}
      tags={tags}
      tagFilter={tagFilter}
      classifiedTemplates={classifiedTemplates}
      capacity={capacity}
      weekCompleted={weekCompleted}
      nearBlocks={nearBlocks}
      projectOptions={projectOptions}
      missionOptions={missionOptions}
      recommendations={recommendations}
      proposals={proposals}
      questPanel={quests.length ? <QuestPanel quests={quests} /> : null}
      habitPanel={habits.length ? <HabitPanel habits={habits} /> : null}
    />
  );
}
