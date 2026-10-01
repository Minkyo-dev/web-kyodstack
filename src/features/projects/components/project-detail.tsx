import Link from "next/link";
import type { Terms } from "@/lib/terms";
import type { DirectionRef, MissionOption } from "@/features/direction/domain/direction.types";
import { DueBadge } from "./due-badge";
import { ProgressBar } from "./progress-bar";
import { MilestoneCreateForm, MilestoneEditor, ProjectArchiveButton, ProjectEditForm, TaskQuickAdd } from "./project-forms";
import { ProjectTaskRow } from "./project-task-row";
import { MILESTONE_STATUS_LABEL, PROJECT_STATUS_LABEL } from "../domain/project.types";
import type { ProjectOverview } from "../queries/project.queries";
import { estimateDuration, type DurationGroup } from "@/features/scheduler/utils/estimator";
import type { DomainRef } from "@/features/classification/domain/classification.types";
import { groupLabels } from "@/features/classification/utils/labels";
import type { SchedulerSettings, Task } from "@/features/scheduler/domain/task.types";
import type { TaskPlanActual } from "@/features/scheduler/domain/work-session.types";
import { AiRecommendationList } from "@/features/ai/components/ai-recommendation-list";
import type { PendingRecommendation } from "@/features/ai/queries/ai.queries";

/** Right pane of /scheduler/projects: milestones, tasks and settings of one project. */
export function ProjectDetail({
  project,
  planActual,
  recommendations,
  ctx,
  terms,
  missionOptions,
  mission,
}: {
  project: ProjectOverview;
  planActual: Record<string, TaskPlanActual>;
  recommendations: PendingRecommendation[];
  ctx: { today: string; settings: SchedulerSettings; groups: DurationGroup[]; domains: DomainRef[] };
  terms: Terms;
  missionOptions: MissionOption[];
  mission: DirectionRef | null;
}) {
  const closed = project.status === "completed" || project.status === "cancelled";
  const labels = groupLabels(ctx.domains);

  const rows = (tasks: Task[]) =>
    tasks.map((t) => (
      <ProjectTaskRow
        key={t.id}
        task={t}
        estimateMinutes={estimateDuration(t, ctx.settings, ctx.groups, labels).minutes}
        actualMinutes={planActual[t.id]?.actual_minutes ?? 0}
      />
    ));

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        {mission && (
          <p className="text-xs text-muted-foreground">
            <Link href={`/scheduler/directive?mission=${mission.id}#mission-detail`} className="hover:underline">
              {mission.title}
            </Link>
            {mission.status !== "active" && ` (${mission.status.toUpperCase()})`} › {project.name}
          </p>
        )}
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-2xl font-semibold">{project.name}</h2>
          <span className="flex items-center gap-3">
            <DueBadge today={ctx.today} target={project.target_date} closed={closed} />
            <span className="rounded-sm border border-border px-1.5 text-xs text-muted-foreground">
              {PROJECT_STATUS_LABEL[project.status]}
            </span>
            {project.archived_at && (
              <span className="rounded-sm border border-border px-1.5 text-xs text-muted-foreground">아카이브됨</span>
            )}
            <ProjectArchiveButton projectId={project.id} archived={project.archived_at !== null} />
          </span>
        </div>
        {project.description && <p className="text-sm text-muted-foreground">{project.description}</p>}
        <ProgressBar progress={project.progress} label={`${terms.project} 진행률`} />
      </header>

      <section aria-labelledby="milestones-heading" className="space-y-3">
        <h3 id="milestones-heading" className="text-lg font-semibold">
          마일스톤
        </h3>
        {project.milestones.length === 0 && (
          <p className="text-sm text-muted-foreground">마일스톤으로 목표를 단계별로 나눠 보세요.</p>
        )}
        <ol className="space-y-3">
          {project.milestones.map((m) => {
            const msClosed = m.status === "completed" || m.status === "cancelled";
            return (
              <li key={m.id} className="rounded-lg border border-border" aria-label={`마일스톤 ${m.name}`}>
                <div className="space-y-2 border-b border-border px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="font-medium">
                      {m.name}
                      <span className="sr-only"> ({MILESTONE_STATUS_LABEL[m.status]})</span>
                    </h4>
                    <span className="flex items-center gap-3">
                      <DueBadge today={ctx.today} target={m.target_date} closed={msClosed} />
                      <MilestoneEditor milestone={m} />
                    </span>
                  </div>
                  <ProgressBar progress={m.progress} label={`${m.name} 진행률`} />
                </div>
                <ul className="divide-y divide-border">{rows(m.tasks)}</ul>
                {!msClosed && <TaskQuickAdd projectId={project.id} milestoneId={m.id} label={m.name} />}
              </li>
            );
          })}
        </ol>
        {!closed && <MilestoneCreateForm projectId={project.id} />}
      </section>

      <section aria-labelledby="loose-heading" className="space-y-2">
        <h3 id="loose-heading" className="text-lg font-semibold">
          마일스톤 없는 {terms.task}
        </h3>
        <div className="rounded-lg border border-border">
          <ul className="divide-y divide-border">{rows(project.looseTasks)}</ul>
          {!closed && <TaskQuickAdd projectId={project.id} milestoneId={null} label={project.name} />}
        </div>
      </section>

      {/* AI-suggested tasks for this project (spec §29); accepted ones become real tasks. */}
      <div className="rounded-lg border border-border p-4">
        <AiRecommendationList
          items={recommendations}
          emptyText={`스케줄러의 'AI 추천'에서 추천을 받으면 이 ${terms.project} 관련 제안이 여기에 표시됩니다.`}
        />
      </div>

      <details className="rounded-lg border border-border p-4">
        <summary className="cursor-pointer text-sm font-medium">{terms.project} 설정</summary>
        <div className="mt-4">
          {/* Remount per project so the uncontrolled fields show this project's values. */}
          <ProjectEditForm key={project.id} project={project} missionOptions={missionOptions} mission={mission} />
        </div>
      </details>
    </div>
  );
}
