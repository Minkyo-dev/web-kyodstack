import "server-only";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import { TASK_TYPES } from "@/features/classification/domain/classification.types";
import { ensureTags, setTaskTags } from "@/features/classification/services/classification.service";
import { listOpenProposals } from "../queries/proposal.queries";
import { proposalView } from "../utils/classify";

async function currentTagIds(ctx: ActionContext, taskId: string) {
  const { data, error } = await ctx.supabase.from("task_tags").select("tag_id").eq("user_id", ctx.user.id).eq("task_id", taskId);
  if (error) throw fromDbError(error);
  return data.map((r) => r.tag_id);
}

async function decide(ctx: ActionContext, ids: string[], patch: Record<string, unknown>) {
  if (ids.length === 0) return;
  const { error } = await ctx.supabase
    .from("task_features")
    .update({ ...patch, decided_at: new Date().toISOString() })
    .eq("user_id", ctx.user.id)
    .eq("status", "proposed")
    .in("id", ids);
  if (error) throw fromDbError(error);
}

/** [적용]: write the proposed values through ownership-checked updates (F1 spec §2). */
export async function applyProposals(ctx: ActionContext, taskId: string): Promise<void> {
  const proposals = (await listOpenProposals(ctx.supabase, ctx.user.id, [taskId]))[taskId] ?? [];
  if (proposals.length === 0) throw new AppError("NOT_FOUND");
  const v = proposalView(proposals, {});
  const patch: { task_type?: string; practice_domain_id?: string; complexity?: number } = {};
  if (v.taskType && (TASK_TYPES as readonly string[]).includes(v.taskType)) patch.task_type = v.taskType;
  if (v.domainId) {
    const { data, error } = await ctx.supabase.from("practice_domains").select("id").eq("user_id", ctx.user.id).eq("id", v.domainId).maybeSingle();
    if (error) throw fromDbError(error);
    if (!data) throw new AppError("VALIDATION_ERROR");
    patch.practice_domain_id = v.domainId;
  }
  if (v.complexity && v.complexity >= 1 && v.complexity <= 5) patch.complexity = v.complexity;
  if (Object.keys(patch).length) {
    const { data, error } = await ctx.supabase.from("tasks").update(patch).eq("id", taskId).eq("user_id", ctx.user.id).select("id");
    if (error) throw fromDbError(error);
    if (!data.length) throw new AppError("NOT_FOUND");
  }
  if (v.skills.length) {
    const tags = await ensureTags(ctx, v.skills);
    await setTaskTags(ctx, taskId, [...(await currentTagIds(ctx, taskId)), ...tags.map((t) => t.id)]);
  }
  await decide(ctx, proposals.map((p) => p.id), { status: "accepted", source: "ai" });
}

/** [무시]: the task is not proposed these types again. */
export async function ignoreProposals(ctx: ActionContext, taskId: string): Promise<void> {
  const proposals = (await listOpenProposals(ctx.supabase, ctx.user.id, [taskId]))[taskId] ?? [];
  await decide(ctx, proposals.map((p) => p.id), { status: "rejected" });
}

/** After [수정] + save: proposals the saved task now matches are accepted as the user's; the rest rejected. */
export async function settleEditedProposals(ctx: ActionContext, taskId: string): Promise<void> {
  const proposals = (await listOpenProposals(ctx.supabase, ctx.user.id, [taskId]))[taskId] ?? [];
  if (proposals.length === 0) return;
  const { data: task, error } = await ctx.supabase
    .from("tasks")
    .select("task_type, practice_domain_id, complexity")
    .eq("id", taskId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!task) throw new AppError("NOT_FOUND");
  const tagIds = await currentTagIds(ctx, taskId);
  const { data: tags } = await ctx.supabase.from("tags").select("id, name").eq("user_id", ctx.user.id).in("id", tagIds.length ? tagIds : ["00000000-0000-0000-0000-000000000000"]);
  const names = new Set((tags ?? []).map((t) => t.name.toLowerCase()));
  const matches = (p: (typeof proposals)[number]) =>
    p.featureType === "task_type" ? task.task_type === p.value
    : p.featureType === "domain" ? task.practice_domain_id === p.value
    : p.featureType === "complexity" ? task.complexity === p.value
    : (p.value as string[]).every((s) => names.has(s));
  await decide(ctx, proposals.filter(matches).map((p) => p.id), { status: "accepted", source: "user", confidence: 1 });
  await decide(ctx, proposals.filter((p) => !matches(p)).map((p) => p.id), { status: "rejected" });
}
