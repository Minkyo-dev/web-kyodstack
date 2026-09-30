"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { CalendarBlock } from "../domain/schedule.types";
import type { SchedulerContext, Task, TaskTemplate } from "../domain/task.types";
import type {
  DailyReflection,
  SessionWithTask,
  TaskPlanActual,
} from "../domain/work-session.types";
import type { StoredProfile } from "../utils/estimator";
import type { ProjectOption } from "@/features/projects/domain/project.types";
import type { PendingRecommendation } from "@/features/ai/queries/ai.queries";
import { FocusBar } from "./focus-bar";
import { TodayTaskPanel } from "./today-task-panel";
import { TaskDetailDrawer } from "./task-detail-drawer";
import { TodayMetricsBar } from "./today-metrics-bar";
import { WeekNavigation } from "./week-navigation";

// FullCalendar touches the DOM on import; render it on the client only.
const WeeklyCalendar = dynamic(
  () => import("./weekly-calendar").then((m) => m.WeeklyCalendar),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        캘린더 불러오는 중…
      </div>
    ),
  },
);

export type SchedulerWorkspaceProps = {
  context: SchedulerContext;
  today: string;
  todayRange: { start: string; end: string };
  week: { startDate: string; endDate: string; days: string[] };
  todayTasks: Task[];
  blocks: CalendarBlock[];
  templates: TaskTemplate[];
  sessions: SessionWithTask[];
  activeSession: SessionWithTask | null;
  reflection: DailyReflection | null;
  planActual: Record<string, TaskPlanActual>;
  durationProfiles: StoredProfile[];
  projectOptions: ProjectOption[];
  recommendations: PendingRecommendation[];
};

export function SchedulerWorkspace(props: SchedulerWorkspaceProps) {
  const { context, today, todayRange, week, todayTasks, blocks, templates } = props;
  const { sessions, activeSession, reflection, planActual, durationProfiles, projectOptions, recommendations } =
    props;
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Any task visible anywhere on screen can be opened in the drawer.
  const tasksById = useMemo(() => {
    const map = new Map<string, Task>();
    for (const b of blocks) map.set(b.task.id, b.task);
    for (const t of todayTasks) map.set(t.id, t);
    return map;
  }, [blocks, todayTasks]);

  const selectedTask = selectedTaskId ? (tasksById.get(selectedTaskId) ?? null) : null;

  return (
    <div className="flex h-[calc(100dvh-3.25rem)] flex-col md:h-dvh">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h1 className="text-lg font-semibold">스케줄러</h1>
        <div className="flex flex-wrap items-center gap-3">
          <WeekNavigation week={week} today={today} timezone={context.timezone} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <TodayTaskPanel
          tasks={todayTasks}
          templates={templates}
          settings={context.settings}
          today={today}
          activeSession={activeSession}
          durationProfiles={durationProfiles}
          recommendations={recommendations}
          onOpenTask={setSelectedTaskId}
        />
        <section aria-label="주간 캘린더" className="min-h-[480px] min-w-0 flex-1 md:min-h-0">
          <WeeklyCalendar
            blocks={blocks}
            sessions={sessions}
            tasksById={tasksById}
            context={context}
            week={week}
            today={today}
            onOpenTask={setSelectedTaskId}
          />
        </section>
      </div>

      <FocusBar session={activeSession} plannedMinutes={null} onFinish={() => {}} />

      <TodayMetricsBar
        tasks={todayTasks}
        blocks={blocks}
        sessions={sessions}
        todayRange={todayRange}
        today={today}
        reflection={reflection}
      />

      <TaskDetailDrawer
        task={selectedTask}
        blocks={selectedTask ? blocks.filter((b) => b.task_id === selectedTask.id) : []}
        sessions={selectedTask ? sessions.filter((x) => x.task_id === selectedTask.id) : []}
        planActual={selectedTask ? (planActual[selectedTask.id] ?? null) : null}
        activeSession={activeSession}
        durationProfiles={durationProfiles}
        projectOptions={projectOptions}
        templates={templates}
        context={context}
        today={today}
        onClose={() => setSelectedTaskId(null)}
      />
    </div>
  );
}
