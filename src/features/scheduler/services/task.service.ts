import "server-only";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import type { Task } from "../domain/task.types";
import { normalizeTask, TASK_SELECT } from "../queries/select";
import { rebuildDurationGroupsQuietly } from "./duration-groups.service";
import { ensureDomain, ensureTags, setTaskTags } from "@/features/classification/services/classification.service";
import type { TaskType } from "@/features/classification/domain/classification.types";
import { getProjectMissionId, resolveTaskLink } from "@/features/projects/services/project.service";
import { resolveDirectionLink } from "@/features/direction/services/direction.service";
import { missionConflict } from "@/features/direction/domain/link-rules";
import type { CreateTaskInput, UpdateTaskInput } from "../schemas/task.schema";

/**
 * Find the caller's template by name or create it. Always scoped to the caller,
 * so a task can never reference another user's template (spec §44).
 */
async function resolveTemplateId(
  { supabase, user }: ActionContext,
  name: string | null | undefined,
): Promise<string | null> {
  const trimmed = name?.trim();
  if (!trimmed) return null;

  const existing = await supabase
    .from("task_templates")
    .select("id")
    .eq("user_id", user.id)
    .eq("name", trimmed)
    .maybeSingle();
  if (existing.error) throw fromDbError(existing.error);
  if (existing.data) return existing.data.id;

  const created = await supabase
    .from("task_templates")
    .upsert({ user_id: user.id, name: trimmed }, { onConflict: "user_id,name" })
    .select("id")
    .single();
  if (created.error) throw fromDbError(created.error);
  return created.data.id;
}

export async function getTask(ctx: ActionContext, taskId: string): Promise<Task> {
  const { data, error } = await ctx.supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("id", taskId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new AppError("NOT_FOUND");
  return normalizeTask(data) as unknown as Task;
}

/** Template preset values (D1 spec §1): type, domain and tags a new task inherits. */
async function templatePreset(ctx: ActionContext, templateId: string | null) {
  if (!templateId) return { taskType: null, domainId: null, tagIds: [] as string[] };
  const { data, error } = await ctx.supabase
    .from("task_templates")
    .select("task_type, practice_domain_id, tags:template_tags!template_tags_template_id_user_id_fkey(tag_id)")
    .eq("id", templateId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (error) throw fromDbError(error);
  return {
    taskType: (data?.task_type ?? null) as TaskType | null,
    domainId: data?.practice_domain_id ?? null,
    tagIds: (data?.tags ?? []).map((t) => t.tag_id),
  };
}

export type CreatedTask = { task: Task; domainCreated: string | null };

/** Direction link + the task/project mission agreement rule (ADR 0020). */
async function resolveDirection(
  ctx: ActionContext,
  input: { missionId?: string | null; protocolId?: string | null },
  projectId: string | null,
  current?: { mission_id: string | null; protocol_id: string | null },
) {
  const direction = await resolveDirectionLink(ctx, input, current);
  if (missionConflict(direction.mission_id, await getProjectMissionId(ctx, projectId))) {
    throw new AppError("VALIDATION_ERROR", "프로젝트가 다른 변화에 연결되어 있습니다.");
  }
  return direction;
}

export async function createTask(ctx: ActionContext, input: CreateTaskInput): Promise<CreatedTask> {
  const templateId = await resolveTemplateId(ctx, input.templateName);
  const link = await resolveTaskLink(ctx, input);
  const direction = await resolveDirection(ctx, input, link.project_id);
  const preset = await templatePreset(ctx, templateId);

  let domainId = input.domainId ?? preset.domainId;
  let domainCreated: string | null = null;
  if (!input.domainId && input.domainName) {
    const ensured = await ensureDomain(ctx, input.domainName);
    domainId = ensured.domain.id;
    if (ensured.created) domainCreated = ensured.domain.name;
  }
  const named = input.tagNames?.length ? await ensureTags(ctx, input.tagNames) : [];
  const tagIds = [...new Set([...preset.tagIds, ...(input.tagIds ?? []), ...named.map((t) => t.id)])];

  const { data, error } = await ctx.supabase
    .from("tasks")
    .insert({
      user_id: ctx.user.id,
      title: input.title,
      user_estimated_minutes: input.userEstimatedMinutes ?? null,
      target_date: input.targetDate ?? null,
      template_id: templateId,
      task_type: input.taskType ?? preset.taskType,
      practice_domain_id: domainId,
      ...link,
      ...direction,
    })
    .select("id")
    .single();
  if (error) throw fromDbError(error);
  if (tagIds.length > 0) await setTaskTags(ctx, data.id, tagIds);
  return { task: await getTask(ctx, data.id), domainCreated };
}

export async function updateTask(ctx: ActionContext, input: UpdateTaskInput): Promise<Task> {
  const before = await getTask(ctx, input.taskId);
  const templateId = await resolveTemplateId(ctx, input.templateName);
  const link = await resolveTaskLink(ctx, input);
  const direction = await resolveDirection(ctx, input, link.project_id, before);
  const { data, error } = await ctx.supabase
    .from("tasks")
    .update({
      title: input.title,
      description: input.description?.trim() || null,
      user_estimated_minutes: input.userEstimatedMinutes,
      target_date: input.targetDate,
      priority: input.priority,
      complexity: input.complexity,
      template_id: templateId,
      task_type: input.taskType,
      practice_domain_id: input.domainId,
      ...link,
      ...direction,
    })
    .eq("id", input.taskId)
    .eq("user_id", ctx.user.id)
    .select(TASK_SELECT)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new AppError("NOT_FOUND");
  await setTaskTags(ctx, input.taskId, input.tagIds);

  const sameTags =
    before.tags.length === input.tagIds.length && before.tags.every((t) => input.tagIds.includes(t.id));
  const learningInputsChanged =
    before.template_id !== templateId ||
    before.user_estimated_minutes !== input.userEstimatedMinutes ||
    before.task_type !== input.taskType ||
    before.practice_domain_id !== input.domainId ||
    !sameTags;
  if (before.status === "completed" && learningInputsChanged) {
    await rebuildDurationGroupsQuietly(ctx);
  }
  // Re-read so the returned task carries the new tag set.
  return getTask(ctx, input.taskId);
}

/**
 * Hard delete only when no actual work was logged. Deleting would cascade into
 * work_sessions and destroy the historical data the product is built on (spec §2, §75).
 */
export async function deleteTask(ctx: ActionContext, taskId: string): Promise<void> {
  const sessions = await ctx.supabase
    .from("work_sessions")
    .select("id", { count: "exact", head: true })
    .eq("task_id", taskId)
    .eq("user_id", ctx.user.id);
  if (sessions.error) throw fromDbError(sessions.error);
  if ((sessions.count ?? 0) > 0) {
    throw new AppError(
      "CONFLICT",
      "실제 작업 기록이 있는 작업은 삭제할 수 없습니다. 대신 취소해 주세요.",
    );
  }

  const { data, error } = await ctx.supabase
    .from("tasks")
    .delete()
    .eq("id", taskId)
    .eq("user_id", ctx.user.id)
    .select("id");
  if (error) throw fromDbError(error);
  if (!data?.length) throw new AppError("NOT_FOUND");
}

type Transition = { from: readonly Task["status"][]; to: Task["status"] };

const TRANSITIONS = {
  complete: { from: ["inbox", "planned", "in_progress"], to: "completed" },
  reopen: { from: ["completed"], to: "planned" },
  cancel: { from: ["inbox", "planned", "in_progress"], to: "cancelled" },
} as const satisfies Record<string, Transition>;

/** Spec §22 task state machine. Completion is always an explicit user action. */
export async function transitionTask(
  ctx: ActionContext,
  taskId: string,
  kind: keyof typeof TRANSITIONS,
): Promise<Task> {
  const current = await getTask(ctx, taskId);
  const rule = TRANSITIONS[kind];
  if (!(rule.from as readonly string[]).includes(current.status)) {
    throw new AppError("CONFLICT", "현재 상태에서는 이 작업을 할 수 없습니다.");
  }
  const { data, error } = await ctx.supabase
    .from("tasks")
    .update({
      status: rule.to,
      completed_at: rule.to === "completed" ? new Date().toISOString() : null,
    })
    .eq("id", taskId)
    .eq("user_id", ctx.user.id)
    .eq("status", current.status) // optimistic concurrency
    .select(TASK_SELECT)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new AppError("CONFLICT");

  // Completion adds (reopen removes) a learning sample (spec §61).
  if (kind === "complete" || kind === "reopen") {
    await rebuildDurationGroupsQuietly(ctx);
  }
  return normalizeTask(data) as unknown as Task;
}
