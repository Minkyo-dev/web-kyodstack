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
import { useActionRunner } from "@/hooks/use-action-runner";
import { useNow } from "@/hooks/use-now";
import { startWorkSessionAction } from "../actions/work-session.actions";
import { estimateDuration } from "../utils/estimator";
import { sessionPlanMinutes } from "../utils/focus";
import { FocusBar } from "./focus-bar";
import { SchedulerSettingsMenu } from "./scheduler-settings-menu";
import { SwitchTaskDialog } from "./switch-task-dialog";
import { WorkSummaryDialog } from "./work-summary-dialog";
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

  const { run } = useActionRunner();
  const [showActual, setShowActual] = useState(context.settings.show_actual_default);
  type StartTarget = { task: Task; blockId?: string };
  const [summary, setSummary] = useState<{ session: SessionWithTask; thenStart?: StartTarget } | null>(null);
  const [switchTarget, setSwitchTarget] = useState<StartTarget | null>(null);

  // "Planned" for a session: its block, else what is left of the personal estimate (focus-flow design §2).
  const planFor = (session: SessionWithTask | null) => {
    if (!session) return { planned: null, estimate: null, prior: 0 };
    const block = session.schedule_block_id ? blocks.find((b) => b.id === session.schedule_block_id) : undefined;
    const task = tasksById.get(session.task_id);
    const estimate = task ? estimateDuration(task, context.settings, durationProfiles).minutes : null;
    const prior = planActual[session.task_id]?.actual_minutes ?? 0;
    return {
      planned: sessionPlanMinutes({ block: block ?? null, estimateMinutes: estimate, priorActualMinutes: prior }),
      estimate,
      prior,
    };
  };

  // One open timer: starting another task goes through the switch dialog (requirements §13).
  const startTask = (task: Task) => {
    if (!activeSession) return run(() => startWorkSessionAction({ taskId: task.id }));
    if (activeSession.task_id !== task.id) setSwitchTarget({ task });
  };

  // Starting from a calendar block links the session to the block (calendar-planning design §2).
  const startBlock = (block: CalendarBlock) => {
    if (!activeSession) return run(() => startWorkSessionAction({ blockId: block.id }));
    setSwitchTarget({ task: block.task, blockId: block.id });
  };

  const now = useNow(60_000);
  const upcomingTaskIds = useMemo(
    () =>
      new Set(
        blocks
          .filter((b) => b.status === "planned" && new Date(b.ends_at).getTime() > now.getTime())
          .map((b) => b.task_id),
      ),
    [blocks, now],
  );

  const summaryPlan = planFor(summary?.session ?? null);

  return (
    <div className="flex h-[calc(100dvh-3.25rem)] flex-col md:h-dvh">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h1 className="text-lg font-semibold">스케줄러</h1>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showActual}
              onChange={(e) => setShowActual(e.target.checked)}
              className="size-3.5 accent-foreground"
            />
            실제 작업 보기
          </label>
          <SchedulerSettingsMenu showActualDefault={context.settings.show_actual_default} />
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
          planActual={planActual}
          upcomingTaskIds={upcomingTaskIds}
          onStartTask={startTask}
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
            showActual={showActual}
            onStartBlock={startBlock}
            onOpenTask={setSelectedTaskId}
          />
        </section>
      </div>

      <FocusBar
        // A new session remounts the bar, so pause-reason chips never carry over to it.
        key={activeSession?.id ?? "none"}
        session={activeSession}
        plannedMinutes={planFor(activeSession).planned}
        onFinish={() => activeSession && setSummary({ session: activeSession })}
      />
      <WorkSummaryDialog
        key={summary?.session.id ?? "none"}
        session={summary?.session ?? null}
        plannedMinutes={summaryPlan.planned}
        estimateMinutes={summaryPlan.estimate}
        priorActualMinutes={summaryPlan.prior}
        timezone={context.timezone}
        onClose={() => setSummary(null)}
        onDone={() => {
          const next = summary?.thenStart;
          setSummary(null);
          if (next) run(() => startWorkSessionAction(next.blockId ? { blockId: next.blockId } : { taskId: next.task.id }));
        }}
      />
      <SwitchTaskDialog
        current={activeSession}
        target={switchTarget}
        onCancel={() => setSwitchTarget(null)}
        onFinishFirst={() => {
          if (activeSession && switchTarget) setSummary({ session: activeSession, thenStart: switchTarget });
          setSwitchTarget(null);
        }}
      />

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
        onStartTask={startTask}
        templates={templates}
        context={context}
        today={today}
        onClose={() => setSelectedTaskId(null)}
      />
    </div>
  );
}
