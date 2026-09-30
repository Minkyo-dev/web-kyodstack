import "server-only";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import type { Task } from "../domain/task.types";
import { TASK_SELECT } from "../queries/select";
import { refreshProfilesQuietly } from "./duration-profile.service";
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
  return data as Task;
}

export async function createTask(ctx: ActionContext, input: CreateTaskInput): Promise<Task> {
  const templateId = await resolveTemplateId(ctx, input.templateName);
  const { data, error } = await ctx.supabase
    .from("tasks")
    .insert({
      user_id: ctx.user.id,
      title: input.title,
      user_estimated_minutes: input.userEstimatedMinutes ?? null,
      target_date: input.targetDate ?? null,
      template_id: templateId,
    })
    .select(TASK_SELECT)
    .single();
  if (error) throw fromDbError(error);
  return data as Task;
}

export async function updateTask(ctx: ActionContext, input: UpdateTaskInput): Promise<Task> {
  const before = await getTask(ctx, input.taskId);
  const templateId = await resolveTemplateId(ctx, input.templateName);
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
    })
    .eq("id", input.taskId)
    .eq("user_id", ctx.user.id)
    .select(TASK_SELECT)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new AppError("NOT_FOUND");

  const learningInputsChanged =
    before.template_id !== templateId ||
    before.user_estimated_minutes !== input.userEstimatedMinutes ||
    before.complexity !== input.complexity;
  if (before.status === "completed" && learningInputsChanged) {
    await refreshProfilesQuietly(ctx, [before.template_id, templateId]);
  }
  return data as Task;
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
    await refreshProfilesQuietly(ctx, [current.template_id]);
  }
  return data as Task;
}
