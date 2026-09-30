import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ChevronLeft } from "lucide-react";
import { requireUserOrRedirect } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { DueBadge } from "@/features/projects/components/due-badge";
import { ProgressBar } from "@/features/projects/components/progress-bar";
import {
  MilestoneCreateForm,
  MilestoneEditor,
  ProjectEditForm,
  TaskQuickAdd,
} from "@/features/projects/components/project-forms";
import { ProjectTaskRow } from "@/features/projects/components/project-task-row";
import { MILESTONE_STATUS_LABEL, PROJECT_STATUS_LABEL } from "@/features/projects/domain/project.types";
import { loadProjectContext } from "@/features/projects/queries/context";
import { getProjectOverview } from "@/features/projects/queries/project.queries";
import { estimateDuration } from "@/features/scheduler/utils/estimator";
import type { Task } from "@/features/scheduler/domain/task.types";
import { AiRecommendationList } from "@/features/ai/components/ai-recommendation-list";
import { listPendingRecommendations } from "@/features/ai/queries/ai.queries";

export const metadata: Metadata = { title: "프로젝트", robots: { index: false } };

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const user = await requireUserOrRedirect();
  const supabase = await createClient();
  const ctx = await loadProjectContext(supabase, user.id);

  let data;
  try {
    data = await getProjectOverview(supabase, id, ctx);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const { overview: project, planActual } = data;
  const recommendations = await listPendingRecommendations(supabase, { projectId: project.id });
  const closed = project.status === "completed" || project.status === "cancelled";

  const rows = (tasks: Task[]) =>
    tasks.map((t) => (
      <ProjectTaskRow
        key={t.id}
        task={t}
        estimateMinutes={estimateDuration(t, ctx.settings, ctx.profiles).minutes}
        actualMinutes={planActual[t.id]?.actual_minutes ?? 0}
      />
    ));

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <Link href="/scheduler/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden />
        프로젝트
      </Link>

      <header className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <span className="flex items-center gap-3">
            <DueBadge today={ctx.today} target={project.target_date} closed={closed} />
            <span className="rounded-sm border border-border px-1.5 text-xs text-muted-foreground">
              {PROJECT_STATUS_LABEL[project.status]}
            </span>
          </span>
        </div>
        {project.description && <p className="text-sm text-muted-foreground">{project.description}</p>}
        <ProgressBar progress={project.progress} label="프로젝트 진행률" />
      </header>

      <section aria-labelledby="milestones-heading" className="space-y-3">
        <h2 id="milestones-heading" className="text-lg font-semibold">
          마일스톤
        </h2>
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
                    <h3 className="font-medium">
                      {m.name}
                      <span className="sr-only"> ({MILESTONE_STATUS_LABEL[m.status]})</span>
                    </h3>
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
        <h2 id="loose-heading" className="text-lg font-semibold">
          마일스톤 없는 할 일
        </h2>
        <div className="rounded-lg border border-border">
          <ul className="divide-y divide-border">{rows(project.looseTasks)}</ul>
          {!closed && <TaskQuickAdd projectId={project.id} milestoneId={null} label={project.name} />}
        </div>
      </section>

      {/* AI-suggested tasks for this project (spec §29); accepted ones become real tasks. */}
      <div className="rounded-lg border border-border p-4">
        <AiRecommendationList
          items={recommendations}
          emptyText="스케줄러의 'AI 추천'에서 추천을 받으면 이 프로젝트 관련 제안이 여기에 표시됩니다."
        />
      </div>

      <details className="rounded-lg border border-border p-4">
        <summary className="cursor-pointer text-sm font-medium">프로젝트 설정</summary>
        <div className="mt-4">
          <ProjectEditForm project={project} />
        </div>
      </details>
    </div>
  );
}
