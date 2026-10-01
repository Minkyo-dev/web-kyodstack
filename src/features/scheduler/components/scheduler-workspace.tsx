"use client";

import { useMemo, useState } from "react";
import { PageHelp } from "@/components/layout/page-help";
import dynamic from "next/dynamic";
import type { CalendarBlock } from "../domain/schedule.types";
import type { SchedulerContext, Task, TaskTemplate } from "../domain/task.types";
import type {
  DailyReflection,
  SessionWithTask,
  TaskPlanActual,
} from "../domain/work-session.types";
import type { DurationGroup } from "../utils/estimator";
import type { DomainRef, TagRef } from "@/features/classification/domain/classification.types";
import { groupLabels } from "@/features/classification/utils/labels";
import type { ProjectOption } from "@/features/projects/domain/project.types";
import type { MissionOption } from "@/features/direction/domain/direction.types";
import type { PendingRecommendation } from "@/features/ai/queries/ai.queries";
import { useActionRunner } from "@/hooks/use-action-runner";
import { cn } from "@/lib/utils";
import { useNow } from "@/hooks/use-now";
import { startWorkSessionAction } from "../actions/work-session.actions";
import { estimateDuration } from "../utils/estimator";
import { sessionPlanMinutes } from "../utils/focus";
import { FocusBar } from "./focus-bar";
import { SchedulerSettingsMenu } from "./scheduler-settings-menu";
import { ClassificationDialog } from "@/features/classification/components/classification-dialog";
import { WorkStandardsDialog } from "@/features/analytics/components/work-standards-dialog";
import type { TemplateWithClassification } from "@/features/classification/queries/classification.queries";
import { SwitchTaskDialog } from "./switch-task-dialog";
import { WorkSummaryDialog } from "./work-summary-dialog";
import { TodayTaskPanel } from "./today-task-panel";
import { TaskDetailDrawer } from "./task-detail-drawer";
import { TodayMetricsBar } from "./today-metrics-bar";
import { WeekNavigation } from "./week-navigation";
import { CalendarViewToggle, MonthNavigation } from "./month-navigation";
import type { LocalMonth } from "../utils/month";
import { WeekSummary } from "./week-summary";
import { CapacityNotice } from "./capacity-notice";
import type { Proposal } from "@/features/ai/utils/classify";

// FullCalendar touches the DOM on import; render it on the client only.
const MonthlyCalendar = dynamic(() => import("./monthly-calendar").then((m) => m.MonthlyCalendar), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-muted-foreground">캘린더 불러오는 중…</div>,
});
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
  durationGroups: DurationGroup[];
  domains: DomainRef[];
  tags: TagRef[];
  tagFilter: string[];
  classifiedTemplates: TemplateWithClassification[];
  /** Typical daily focused minutes (null: not enough history). */
  capacity: number | null;
  weekCompleted: number;
  /** Today's and tomorrow's blocks, for the capacity notice. */
  nearBlocks: CalendarBlock[];
  projectOptions: ProjectOption[];
  missionOptions: MissionOption[];
  recommendations: PendingRecommendation[];
  /** Open AI proposals by task id (F1). */
  proposals: Record<string, Proposal[]>;
  /** Quest panel slot composed by the page (E2). */
  questPanel?: React.ReactNode;
  /** Habit panel slot composed by the page (G2). */
  habitPanel?: React.ReactNode;
  /** Month view (?view=month); null = week view. */
  monthView?: LocalMonth | null;
};

export function SchedulerWorkspace(props: SchedulerWorkspaceProps) {
  const { context, today, todayRange, week, todayTasks, blocks, templates, monthView = null } = props;
  const { sessions, activeSession, reflection, planActual, durationGroups, domains, tags, projectOptions, missionOptions, recommendations } =
    props;
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const labels = useMemo(() => groupLabels(domains), [domains]);
  const { tagFilter, classifiedTemplates } = props;
  const [classifyOpen, setClassifyOpen] = useState(false);
  const [standardsOpen, setStandardsOpen] = useState(false);

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
    const estimate = task ? estimateDuration(task, context.settings, durationGroups, labels).minutes : null;
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
        <div className="flex items-center gap-1">
          <h1 className="text-lg font-semibold">스케줄러</h1>
          <PageHelp page="scheduler" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", monthView && "hidden")}>
            <input
              type="checkbox"
              checked={showActual}
              onChange={(e) => setShowActual(e.target.checked)}
              className="size-3.5 accent-foreground"
            />
            실제 작업 보기
          </label>
          <SchedulerSettingsMenu
            showActualDefault={context.settings.show_actual_default}
            onManageClassification={() => setClassifyOpen(true)}
            onOpenWorkStandards={() => setStandardsOpen(true)}
          />
          <CalendarViewToggle
            view={monthView ? "month" : "week"}
            // From a week, open the month of today when that week contains it, else the week's first day.
            month={monthView ? monthView.month : (today >= week.startDate && today < week.endDate ? today : week.startDate).slice(0, 7)}
            weekStart={monthView ? (today.startsWith(monthView.month) ? today : `${monthView.month}-01`) : week.startDate}
          />
          {monthView ? (
            <MonthNavigation month={monthView} today={today} />
          ) : (
            <WeekNavigation week={week} today={today} timezone={context.timezone} />
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <TodayTaskPanel
          tasks={todayTasks}
          templates={templates}
          settings={context.settings}
          today={today}
          activeSession={activeSession}
          durationGroups={durationGroups}
          labels={labels}
          recommendations={recommendations}
          tags={tags}
          domains={domains}
          tagFilter={tagFilter}
          blocks={blocks}
          sessions={sessions}
          context={context}
          todayRange={todayRange}
          onStartBlock={startBlock}
          untypedTemplateCount={classifiedTemplates.filter((t) => !t.task_type).length}
          onManageClassification={() => setClassifyOpen(true)}
          planActual={planActual}
          upcomingTaskIds={upcomingTaskIds}
          onStartTask={startTask}
          questPanel={props.questPanel}
          habitPanel={props.habitPanel}
          onOpenTask={setSelectedTaskId}
        />
        <section
          aria-label={monthView ? "월간 캘린더" : "주간 캘린더"}
          className="flex min-h-[480px] min-w-0 flex-1 flex-col md:min-h-0"
        >
          {!monthView && (
            <WeekSummary
              week={week}
              blocks={blocks}
              sessions={sessions}
              completed={props.weekCompleted}
              today={today}
              timezone={context.timezone}
            />
          )}
          <CapacityNotice capacity={props.capacity} nearBlocks={props.nearBlocks} today={today} timezone={context.timezone} />
          <div className="min-h-0 flex-1">
            {monthView ? (
              <MonthlyCalendar
                blocks={blocks}
                sessions={sessions}
                context={context}
                month={monthView}
                onOpenTask={setSelectedTaskId}
              />
            ) : (
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
            )}
          </div>
        </section>
      </div>

      <FocusBar
        // A new session remounts the bar, so pause-reason chips never carry over to it.
        key={`focus-bar-${activeSession?.id ?? "none"}`}
        session={activeSession}
        plannedMinutes={planFor(activeSession).planned}
        onFinish={() => activeSession && setSummary({ session: activeSession })}
      />
      <WorkSummaryDialog
        key={`summary-${summary?.session.id ?? "none"}`}
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
      <WorkStandardsDialog
        settings={context.settings}
        open={standardsOpen}
        onOpenChange={setStandardsOpen}
        trigger={false}
      />
      <ClassificationDialog
        open={classifyOpen}
        onOpenChange={setClassifyOpen}
        tags={tags}
        domains={domains}
        templates={classifiedTemplates}
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
        durationGroups={durationGroups}
        labels={labels}
        tags={tags}
        domains={domains}
        projectOptions={projectOptions}
        missionOptions={missionOptions}
        proposals={selectedTask ? (props.proposals[selectedTask.id] ?? []) : []}
        onStartTask={startTask}
        templates={templates}
        context={context}
        today={today}
        onClose={() => setSelectedTaskId(null)}
      />
    </div>
  );
}
