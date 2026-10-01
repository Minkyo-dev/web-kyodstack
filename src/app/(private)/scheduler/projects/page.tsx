import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { requireUserOrRedirect } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { DueBadge } from "@/features/projects/components/due-badge";
import { ProgressBar } from "@/features/projects/components/progress-bar";
import { ProjectCreateForm } from "@/features/projects/components/project-forms";
import { ProjectDetail } from "@/features/projects/components/project-detail";
import { PROJECT_STATUS_LABEL } from "@/features/projects/domain/project.types";
import { loadProjectContext } from "@/features/projects/queries/context";
import { getProjectOverview, listProjectOverviews } from "@/features/projects/queries/project.queries";
import { listPendingRecommendations } from "@/features/ai/queries/ai.queries";
import { getPlayerProfile } from "@/features/gamification/queries/xp.queries";
import { josa, termsFor } from "@/lib/terms";

export const metadata: Metadata = { title: "프로젝트", robots: { index: false } };

/** Two panes: projects on the left, the selected project (?project=) on the right. */
export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const user = await requireUserOrRedirect();
  const supabase = await createClient();
  const profile = await getPlayerProfile(supabase, user.id);
  const terms = termsFor(!!profile?.gamification_enabled && !!profile.quest_terminology);
  const { project: projectParam } = await searchParams;
  const ctx = await loadProjectContext(supabase, user.id);
  const projects = await listProjectOverviews(supabase, ctx);

  const selectedId = projectParam && z.uuid().safeParse(projectParam).success ? projectParam : null;
  let selected: Awaited<ReturnType<typeof getProjectOverview>> | null = null;
  if (selectedId) {
    try {
      selected = await getProjectOverview(supabase, selectedId, ctx);
    } catch (e) {
      if (!(e instanceof AppError && e.code === "NOT_FOUND")) throw e;
    }
  }
  const recommendations = selected
    ? await listPendingRecommendations(supabase, { projectId: selected.overview.id })
    : [];

  return (
    <div className="flex min-h-dvh flex-col md:h-dvh md:flex-row">
      <aside
        aria-labelledby="projects-heading"
        className="flex shrink-0 flex-col border-b border-border md:w-80 md:border-r md:border-b-0"
      >
        <div className="space-y-3 border-b border-border p-4">
          <h1 id="projects-heading" className="text-lg font-semibold">
            {terms.project}
          </h1>
          <ProjectCreateForm />
        </div>
        {projects.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {`아직 ${josa(terms.project, "이/가")} 없습니다. 목표가 있는 작업 묶음을 ${josa(terms.project, "으로/로")} 만들어 보세요.`}
          </p>
        ) : (
          <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto" aria-label={`${terms.project} 목록`}>
            {projects.map((p) => {
              const closed = p.status === "completed" || p.status === "cancelled";
              const active = p.id === selected?.overview.id;
              return (
                <li key={p.id}>
                  <Link
                    href={`/scheduler/projects?project=${p.id}#project-detail`}
                    aria-current={active ? "page" : undefined}
                    className={cn("block space-y-2 px-4 py-3 hover:bg-muted/50", active && "bg-muted")}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">{p.name}</span>
                      <span className="flex items-center gap-2">
                        <DueBadge today={ctx.today} target={p.target_date} closed={closed} />
                        <span className="rounded-sm border border-border px-1.5 text-xs text-muted-foreground">
                          {PROJECT_STATUS_LABEL[p.status]}
                        </span>
                      </span>
                    </div>
                    <ProgressBar progress={p.progress} label={`${p.name} 진행률`} />
                    {p.nextMilestone && (
                      <p className="text-xs text-muted-foreground">
                        다음 마일스톤: {p.nextMilestone.name}
                        {p.nextMilestone.target_date && ` · ${p.nextMilestone.target_date}`}
                      </p>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      <section id="project-detail" aria-label={`${terms.project} 상세`} className="min-w-0 flex-1 overflow-y-auto p-6">
        {selected ? (
          <ProjectDetail
            project={selected.overview}
            planActual={selected.planActual}
            recommendations={recommendations}
            ctx={ctx}
            terms={terms}
          />
        ) : (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {selectedId ? `${josa(terms.project, "을/를")} 찾을 수 없습니다. ` : ""}
            {`왼쪽에서 ${josa(terms.project, "을/를")} 선택하거나 새로 만드세요.`}
          </p>
        )}
      </section>
    </div>
  );
}
