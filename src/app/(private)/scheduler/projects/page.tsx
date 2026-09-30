import type { Metadata } from "next";
import Link from "next/link";
import { requireUserOrRedirect } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DueBadge } from "@/features/projects/components/due-badge";
import { ProgressBar } from "@/features/projects/components/progress-bar";
import { ProjectCreateForm } from "@/features/projects/components/project-forms";
import { PROJECT_STATUS_LABEL } from "@/features/projects/domain/project.types";
import { loadProjectContext } from "@/features/projects/queries/context";
import { listProjectOverviews } from "@/features/projects/queries/project.queries";

export const metadata: Metadata = { title: "프로젝트", robots: { index: false } };

export default async function ProjectsPage() {
  const user = await requireUserOrRedirect();
  const supabase = await createClient();
  const ctx = await loadProjectContext(supabase, user.id);
  const projects = await listProjectOverviews(supabase, ctx);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="space-y-4">
        <h1 className="text-2xl font-semibold">프로젝트</h1>
        <ProjectCreateForm />
      </header>

      {projects.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          아직 프로젝트가 없습니다. 목표가 있는 작업 묶음을 프로젝트로 만들어 보세요.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border" aria-label="프로젝트 목록">
          {projects.map((p) => {
            const closed = p.status === "completed" || p.status === "cancelled";
            return (
              <li key={p.id}>
                <Link
                  href={`/scheduler/projects/${p.id}`}
                  className="block space-y-2 px-4 py-3 hover:bg-muted/50"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{p.name}</span>
                    <span className="flex items-center gap-3">
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
    </div>
  );
}
