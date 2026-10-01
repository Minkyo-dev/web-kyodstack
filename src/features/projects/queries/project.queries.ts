import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { AppError, fromDbError } from "@/lib/errors";
import type { SchedulerSettings, Task } from "@/features/scheduler/domain/task.types";
import { normalizeTask, TASK_SELECT } from "@/features/scheduler/queries/select";
import { listTaskPlanActual } from "@/features/scheduler/queries/analytics.queries";
import { estimateDuration, type DurationGroup } from "@/features/scheduler/utils/estimator";
import type { DomainRef } from "@/features/classification/domain/classification.types";
import { groupLabels } from "@/features/classification/utils/labels";
import type { TaskPlanActual } from "@/features/scheduler/domain/work-session.types";
import type { Milestone, Project, ProjectOption } from "../domain/project.types";
import { computeProgress, type Progress } from "../utils/progress";

const STATUS_ORDER = ["active", "planned", "paused", "completed", "cancelled"];

export type MilestoneWithProgress = Milestone & { progress: Progress; tasks: Task[] };

export type ProjectOverview = Project & {
  progress: Progress;
  milestones: MilestoneWithProgress[];
  /** Tasks without a milestone. */
  looseTasks: Task[];
  nextMilestone: Milestone | null;
};

type Ctx = { settings: SchedulerSettings; groups: DurationGroup[]; domains: DomainRef[] };

function progressOf(tasks: Task[], planActual: Record<string, TaskPlanActual>, ctx: Ctx) {
  return computeProgress(
    tasks.map((t) => ({
      status: t.status,
      estimateMinutes: estimateDuration(t, ctx.settings, ctx.groups, groupLabels(ctx.domains)).minutes,
      actualMinutes: planActual[t.id]?.actual_minutes ?? 0,
    })),
  );
}

function assemble(
  project: Project,
  milestones: Milestone[],
  tasks: Task[],
  planActual: Record<string, TaskPlanActual>,
  ctx: Ctx,
): ProjectOverview {
  const mine = tasks.filter((t) => t.project_id === project.id);
  const ms = milestones
    .filter((m) => m.project_id === project.id)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((m) => {
      const mt = mine.filter((t) => t.milestone_id === m.id);
      return { ...m, tasks: mt, progress: progressOf(mt, planActual, ctx) };
    });
  const next =
    ms
      .filter((m) => m.status !== "completed" && m.status !== "cancelled")
      .sort((a, b) => (a.target_date ?? "9999").localeCompare(b.target_date ?? "9999"))[0] ?? null;
  return {
    ...project,
    milestones: ms,
    looseTasks: mine.filter((t) => !t.milestone_id),
    progress: progressOf(mine, planActual, ctx),
    nextMilestone: next,
  };
}

async function loadTasks(supabase: SupabaseServerClient, projectId?: string) {
  let q = supabase.from("tasks").select(TASK_SELECT).not("project_id", "is", null).neq("status", "cancelled");
  if (projectId) q = q.eq("project_id", projectId);
  const { data, error } = await q.order("sort_order").order("created_at").limit(1000);
  if (error) throw fromDbError(error);
  return (data ?? []).map((r) => normalizeTask(r)) as unknown as Task[];
}

/** Every project with milestone and task progress (spec §29). A personal-scale read. */
export async function listProjectOverviews(supabase: SupabaseServerClient, ctx: Ctx): Promise<ProjectOverview[]> {
  const [projects, milestones, tasks] = await Promise.all([
    supabase.from("projects").select("*").order("target_date", { nullsFirst: false }).order("created_at"),
    supabase.from("milestones").select("*"),
    loadTasks(supabase),
  ]);
  if (projects.error) throw fromDbError(projects.error);
  if (milestones.error) throw fromDbError(milestones.error);
  const planActual = await listTaskPlanActual(supabase, tasks.map((t) => t.id));
  return (projects.data as Project[])
    .map((p) => assemble(p, milestones.data as Milestone[], tasks, planActual, ctx))
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
}

export async function getProjectOverview(
  supabase: SupabaseServerClient,
  projectId: string,
  ctx: Ctx,
): Promise<{ overview: ProjectOverview; planActual: Record<string, TaskPlanActual> }> {
  const [project, milestones, tasks] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).maybeSingle(),
    supabase.from("milestones").select("*").eq("project_id", projectId),
    loadTasks(supabase, projectId),
  ]);
  if (project.error) throw fromDbError(project.error);
  if (!project.data) throw new AppError("NOT_FOUND");
  if (milestones.error) throw fromDbError(milestones.error);
  const planActual = await listTaskPlanActual(supabase, tasks.map((t) => t.id));
  return {
    overview: assemble(project.data as Project, milestones.data as Milestone[], tasks, planActual, ctx),
    planActual,
  };
}

/** Open projects and milestones for pickers. */
export async function listProjectOptions(supabase: SupabaseServerClient): Promise<ProjectOption[]> {
  const [projects, milestones] = await Promise.all([
    supabase.from("projects").select("id, name").in("status", ["planned", "active", "paused"]).is("archived_at", null).order("name"),
    supabase
      .from("milestones")
      .select("id, name, project_id, sort_order")
      .in("status", ["planned", "in_progress"])
      .order("sort_order"),
  ]);
  if (projects.error) throw fromDbError(projects.error);
  if (milestones.error) throw fromDbError(milestones.error);
  return projects.data.map((p) => ({
    id: p.id,
    name: p.name,
    milestones: milestones.data.filter((m) => m.project_id === p.id).map((m) => ({ id: m.id, name: m.name })),
  }));
}
