import "server-only";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import { countProjectConflicts } from "@/features/direction/domain/link-rules";
import { resolveDirectionLink } from "@/features/direction/services/direction.service";
import type { Milestone, Project } from "../domain/project.types";
import type {
  CreateMilestoneInput,
  SetProjectArchivedInput,
  CreateProjectInput,
  UpdateMilestoneInput,
  UpdateProjectInput,
} from "../schemas/project.schema";

export async function createProject(ctx: ActionContext, input: CreateProjectInput): Promise<Project> {
  const { data, error } = await ctx.supabase
    .from("projects")
    .insert({
      user_id: ctx.user.id,
      name: input.name,
      description: input.description || null,
      target_date: input.targetDate ?? null,
    })
    .select()
    .single();
  if (error) throw fromDbError(error);
  return data as Project;
}

/** The mission a project lends its tasks (ADR 0020); null when unlinked or no project. */
export async function getProjectMissionId(ctx: ActionContext, projectId: string | null): Promise<string | null> {
  if (!projectId) return null;
  const { data, error } = await ctx.supabase
    .from("projects")
    .select("mission_id")
    .eq("id", projectId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (error) throw fromDbError(error);
  return data?.mission_id ?? null;
}

export async function updateProject(ctx: ActionContext, input: UpdateProjectInput): Promise<Project> {
  const before = await ctx.supabase
    .from("projects")
    .select("mission_id")
    .eq("id", input.projectId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (before.error) throw fromDbError(before.error);
  if (!before.data) throw new AppError("NOT_FOUND");
  const { mission_id: missionId } = await resolveDirectionLink(
    ctx,
    { missionId: input.missionId },
    { mission_id: before.data.mission_id, protocol_id: null },
  );
  if (missionId) {
    const tasks = await ctx.supabase
      .from("tasks")
      .select("mission_id")
      .eq("project_id", input.projectId)
      .eq("user_id", ctx.user.id)
      .not("mission_id", "is", null);
    if (tasks.error) throw fromDbError(tasks.error);
    const conflicts = countProjectConflicts(missionId, tasks.data.map((t) => t.mission_id));
    if (conflicts > 0) {
      throw new AppError("VALIDATION_ERROR", `작업 ${conflicts}개가 다른 결과 목표에 연결되어 있습니다.`);
    }
  }
  const { data, error } = await ctx.supabase
    .from("projects")
    .update({
      name: input.name,
      description: input.description || null,
      status: input.status,
      priority: input.priority,
      start_date: input.startDate,
      target_date: input.targetDate,
      mission_id: missionId,
    })
    .eq("id", input.projectId)
    .eq("user_id", ctx.user.id)
    .select()
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new AppError("NOT_FOUND");
  return data as Project;
}

/** Archive folder (ADR 0024): sets or clears archived_at; status and task links stay as they are. */
export async function setProjectArchived(ctx: ActionContext, input: SetProjectArchivedInput): Promise<Project> {
  const { data, error } = await ctx.supabase
    .from("projects")
    .update({ archived_at: input.archived ? new Date().toISOString() : null })
    .eq("id", input.projectId)
    .eq("user_id", ctx.user.id)
    .select()
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new AppError("NOT_FOUND");
  return data as Project;
}

/** Ownership (spec §17.4) is checked here and by the composite FK. */
export async function createMilestone(ctx: ActionContext, input: CreateMilestoneInput): Promise<Milestone> {
  const project = await ctx.supabase
    .from("projects")
    .select("id, status")
    .eq("id", input.projectId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (project.error) throw fromDbError(project.error);
  if (!project.data) throw new AppError("NOT_FOUND");
  if (project.data.status === "cancelled") {
    throw new AppError("CONFLICT", "취소된 프로젝트에는 마일스톤을 추가할 수 없습니다.");
  }

  const last = await ctx.supabase
    .from("milestones")
    .select("sort_order")
    .eq("project_id", input.projectId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last.error) throw fromDbError(last.error);

  const { data, error } = await ctx.supabase
    .from("milestones")
    .insert({
      user_id: ctx.user.id,
      project_id: input.projectId,
      name: input.name,
      target_date: input.targetDate ?? null,
      sort_order: (last.data?.sort_order ?? -1) + 1,
    })
    .select()
    .single();
  if (error) throw fromDbError(error);
  return data as Milestone;
}

export async function updateMilestone(ctx: ActionContext, input: UpdateMilestoneInput): Promise<Milestone> {
  const { data, error } = await ctx.supabase
    .from("milestones")
    .update({
      name: input.name,
      description: input.description || null,
      status: input.status,
      target_date: input.targetDate,
      sort_order: input.sortOrder,
    })
    .eq("id", input.milestoneId)
    .eq("user_id", ctx.user.id)
    .select()
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new AppError("NOT_FOUND");
  return data as Milestone;
}

/**
 * Resolve a task's project/milestone link (spec §44). A milestone implies its project,
 * so the pair can never disagree. Both ids must belong to the caller.
 */
export async function resolveTaskLink(
  ctx: ActionContext,
  input: { projectId?: string | null; milestoneId?: string | null },
): Promise<{ project_id: string | null; milestone_id: string | null }> {
  if (input.milestoneId) {
    const { data, error } = await ctx.supabase
      .from("milestones")
      .select("id, project_id")
      .eq("id", input.milestoneId)
      .eq("user_id", ctx.user.id)
      .maybeSingle();
    if (error) throw fromDbError(error);
    if (!data) throw new AppError("NOT_FOUND", "마일스톤을 찾을 수 없습니다.");
    if (input.projectId && input.projectId !== data.project_id) {
      throw new AppError("VALIDATION_ERROR", "마일스톤이 선택한 프로젝트에 속하지 않습니다.");
    }
    return { project_id: data.project_id, milestone_id: data.id };
  }
  if (input.projectId) {
    const { data, error } = await ctx.supabase
      .from("projects")
      .select("id")
      .eq("id", input.projectId)
      .eq("user_id", ctx.user.id)
      .maybeSingle();
    if (error) throw fromDbError(error);
    if (!data) throw new AppError("NOT_FOUND", "프로젝트를 찾을 수 없습니다.");
    return { project_id: data.id, milestone_id: null };
  }
  return { project_id: null, milestone_id: null };
}
