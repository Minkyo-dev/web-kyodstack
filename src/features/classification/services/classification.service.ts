import "server-only";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import { rebuildDurationGroupsQuietly } from "@/features/scheduler/services/duration-groups.service";
import type { DomainRef, TagColor, TagRef } from "../domain/classification.types";
import { listDomainRefs } from "../queries/classification.queries";
import type {
  CreateDomainInput,
  CreateTagInput,
  UpdateDomainInput,
  UpdateTagInput,
  UpdateTemplateClassificationInput,
} from "../schemas/classification.schema";
import { sameName, wouldCycle } from "../utils/quick-add";

type DbError = { code?: string; message?: string };

/** Names are unique per user, case-insensitively; foreign ids fail the composite FKs. */
function fromClassificationError(error: DbError): AppError {
  if (error.code === "23505") return new AppError("CONFLICT", "같은 이름이 이미 있습니다.");
  if (error.code === "23503") return new AppError("NOT_FOUND");
  return fromDbError(error as Parameters<typeof fromDbError>[0]);
}

/** Exact, case-insensitive ilike: escape the LIKE wildcards. */
const exact = (name: string) => name.trim().replace(/[\\%_]/g, (c) => `\\${c}`);

export async function createTag(ctx: ActionContext, input: CreateTagInput): Promise<TagRef> {
  const { data, error } = await ctx.supabase
    .from("tags")
    .insert({ user_id: ctx.user.id, name: input.name, color: input.color ?? null })
    .select("id, name, color")
    .single();
  if (error) throw fromClassificationError(error);
  return data as TagRef;
}

export async function updateTag(ctx: ActionContext, input: UpdateTagInput): Promise<void> {
  const { data, error } = await ctx.supabase
    .from("tags")
    .update({ name: input.name, color: input.color })
    .eq("id", input.tagId)
    .eq("user_id", ctx.user.id)
    .select("id");
  if (error) throw fromClassificationError(error);
  if (!data?.length) throw new AppError("NOT_FOUND");
}

/** Removes only the links; tasks stay (the join rows cascade). */
export async function deleteTag(ctx: ActionContext, tagId: string): Promise<void> {
  const { data, error } = await ctx.supabase.from("tags").delete().eq("id", tagId).eq("user_id", ctx.user.id).select("id");
  if (error) throw fromClassificationError(error);
  if (!data?.length) throw new AppError("NOT_FOUND");
  await rebuildDurationGroupsQuietly(ctx);
}

export async function createDomain(ctx: ActionContext, input: CreateDomainInput): Promise<DomainRef> {
  const { data, error } = await ctx.supabase
    .from("practice_domains")
    .insert({ user_id: ctx.user.id, name: input.name, parent_id: input.parentId ?? null })
    .select("id, name, parent_id")
    .single();
  if (error) throw fromClassificationError(error);
  return data;
}

export async function updateDomain(ctx: ActionContext, input: UpdateDomainInput): Promise<void> {
  const domains = await listDomainRefs(ctx.supabase, ctx.user.id);
  if (wouldCycle(domains, input.domainId, input.parentId)) {
    throw new AppError("VALIDATION_ERROR", "하위 영역을 상위로 지정할 수 없습니다.");
  }
  const { data, error } = await ctx.supabase
    .from("practice_domains")
    .update({ name: input.name, parent_id: input.parentId })
    .eq("id", input.domainId)
    .eq("user_id", ctx.user.id)
    .select("id");
  if (error) throw fromClassificationError(error);
  if (!data?.length) throw new AppError("NOT_FOUND");
}

export async function deleteDomain(ctx: ActionContext, domainId: string): Promise<void> {
  const { data, error } = await ctx.supabase
    .from("practice_domains")
    .delete()
    .eq("id", domainId)
    .eq("user_id", ctx.user.id)
    .select("id");
  if (error) throw fromClassificationError(error);
  if (!data?.length) throw new AppError("NOT_FOUND");
  await rebuildDurationGroupsQuietly(ctx);
}

/** Find each name (case-insensitive) or create it. Returns tags in input order, deduplicated. */
export async function ensureTags(ctx: ActionContext, names: string[]): Promise<TagRef[]> {
  const out: TagRef[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name || out.some((t) => sameName(t.name, name))) continue;
    const found = await ctx.supabase
      .from("tags")
      .select("id, name, color")
      .eq("user_id", ctx.user.id)
      .ilike("name", exact(name))
      .maybeSingle();
    if (found.error) throw fromClassificationError(found.error);
    out.push(found.data ? (found.data as TagRef) : await createTag(ctx, { name }));
  }
  return out;
}

export async function ensureDomain(ctx: ActionContext, name: string): Promise<{ domain: DomainRef; created: boolean }> {
  const found = await ctx.supabase
    .from("practice_domains")
    .select("id, name, parent_id")
    .eq("user_id", ctx.user.id)
    .ilike("name", exact(name))
    .maybeSingle();
  if (found.error) throw fromClassificationError(found.error);
  if (found.data) return { domain: found.data, created: false };
  return { domain: await createDomain(ctx, { name }), created: true };
}

/** Replace a task's tag set. Foreign tag ids fail the composite FK (→ NOT_FOUND). */
export async function setTaskTags(ctx: ActionContext, taskId: string, tagIds: string[]): Promise<void> {
  const unique = [...new Set(tagIds)];
  let del = ctx.supabase.from("task_tags").delete().eq("task_id", taskId).eq("user_id", ctx.user.id);
  if (unique.length > 0) del = del.not("tag_id", "in", `(${unique.join(",")})`);
  const removed = await del;
  if (removed.error) throw fromClassificationError(removed.error);
  if (unique.length === 0) return;
  const { error } = await ctx.supabase
    .from("task_tags")
    .upsert(
      unique.map((tag_id) => ({ task_id: taskId, tag_id, user_id: ctx.user.id })),
      { onConflict: "task_id,tag_id", ignoreDuplicates: true },
    );
  if (error) throw fromClassificationError(error);
}

/**
 * Template as a preset (D1 spec §1). Optionally fills tasks of this template whose type/domain is still
 * empty and adds the template's tags to them.
 */
export async function updateTemplateClassification(
  ctx: ActionContext,
  input: UpdateTemplateClassificationInput,
): Promise<{ updatedTasks: number }> {
  const uid = ctx.user.id;
  const up = await ctx.supabase
    .from("task_templates")
    .update({
      task_type: input.taskType,
      practice_domain_id: input.domainId,
      default_estimate_minutes: input.defaultEstimateMinutes,
    })
    .eq("id", input.templateId)
    .eq("user_id", uid)
    .select("id");
  if (up.error) throw fromClassificationError(up.error);
  if (!up.data?.length) throw new AppError("NOT_FOUND");

  const tagIds = [...new Set(input.tagIds)];
  let del = ctx.supabase.from("template_tags").delete().eq("template_id", input.templateId).eq("user_id", uid);
  if (tagIds.length > 0) del = del.not("tag_id", "in", `(${tagIds.join(",")})`);
  const removed = await del;
  if (removed.error) throw fromClassificationError(removed.error);
  if (tagIds.length > 0) {
    const ins = await ctx.supabase
      .from("template_tags")
      .upsert(
        tagIds.map((tag_id) => ({ template_id: input.templateId, tag_id, user_id: uid })),
        { onConflict: "template_id,tag_id", ignoreDuplicates: true },
      );
    if (ins.error) throw fromClassificationError(ins.error);
  }

  if (!input.applyToTasks) return { updatedTasks: 0 };

  const tasks = await ctx.supabase
    .from("tasks")
    .select("id, task_type, practice_domain_id")
    .eq("template_id", input.templateId)
    .eq("user_id", uid);
  if (tasks.error) throw fromClassificationError(tasks.error);
  let updated = 0;
  for (const t of tasks.data) {
    const patch: { task_type?: string; practice_domain_id?: string } = {};
    if (!t.task_type && input.taskType) patch.task_type = input.taskType;
    if (!t.practice_domain_id && input.domainId) patch.practice_domain_id = input.domainId;
    if (Object.keys(patch).length > 0) {
      const u = await ctx.supabase.from("tasks").update(patch).eq("id", t.id).eq("user_id", uid);
      if (u.error) throw fromClassificationError(u.error);
      updated += 1;
    }
  }
  if (tagIds.length > 0 && tasks.data.length > 0) {
    const links = tasks.data.flatMap((t) => tagIds.map((tag_id) => ({ task_id: t.id, tag_id, user_id: uid })));
    const ins = await ctx.supabase.from("task_tags").upsert(links, { onConflict: "task_id,tag_id", ignoreDuplicates: true });
    if (ins.error) throw fromClassificationError(ins.error);
  }
  await rebuildDurationGroupsQuietly(ctx);
  return { updatedTasks: updated };
}

export type { TagColor };
