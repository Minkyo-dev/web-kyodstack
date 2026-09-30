"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import * as svc from "../services/classification.service";
import { rebuildDurationGroupsQuietly } from "@/features/scheduler/services/duration-groups.service";
import {
  createDomainSchema,
  createTagSchema,
  domainIdSchema,
  setTaskTagsSchema,
  tagIdSchema,
  updateDomainSchema,
  updateTagSchema,
  updateTemplateClassificationSchema,
} from "../schemas/classification.schema";

const done = <T>(value: T) => {
  revalidatePath("/scheduler", "layout");
  return value;
};

export async function createTagAction(input: unknown) {
  return runAction("tag.create", createTagSchema, input, async (data, ctx) => done(await svc.createTag(ctx, data)));
}

export async function updateTagAction(input: unknown) {
  return runAction("tag.update", updateTagSchema, input, async (data, ctx) => done(await svc.updateTag(ctx, data)));
}

export async function deleteTagAction(input: unknown) {
  return runAction("tag.delete", tagIdSchema, input, async ({ tagId }, ctx) => done(await svc.deleteTag(ctx, tagId)));
}

export async function createDomainAction(input: unknown) {
  return runAction("domain.create", createDomainSchema, input, async (data, ctx) =>
    done(await svc.createDomain(ctx, data)),
  );
}

export async function updateDomainAction(input: unknown) {
  return runAction("domain.update", updateDomainSchema, input, async (data, ctx) =>
    done(await svc.updateDomain(ctx, data)),
  );
}

export async function deleteDomainAction(input: unknown) {
  return runAction("domain.delete", domainIdSchema, input, async ({ domainId }, ctx) =>
    done(await svc.deleteDomain(ctx, domainId)),
  );
}

export async function updateTemplateClassificationAction(input: unknown) {
  return runAction("template.classify", updateTemplateClassificationSchema, input, async (data, ctx) =>
    done(await svc.updateTemplateClassification(ctx, data)),
  );
}

export async function setTaskTagsAction(input: unknown) {
  return runAction("task.tags", setTaskTagsSchema, input, async ({ taskId, tagIds }, ctx) => {
    await svc.setTaskTags(ctx, taskId, tagIds);
    // A completed task's tags are learning inputs (tag groups).
    const { data } = await ctx.supabase.from("tasks").select("status").eq("id", taskId).eq("user_id", ctx.user.id).maybeSingle();
    if (data?.status === "completed") await rebuildDurationGroupsQuietly(ctx);
    return done(null);
  });
}
