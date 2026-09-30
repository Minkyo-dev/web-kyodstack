import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { fromDbError } from "@/lib/errors";
import type { DomainRef, TagRef, TaskType } from "../domain/classification.types";

/** Explicit user scope: also correct under the service role (jobs). */
export async function listDomainRefs(supabase: SupabaseServerClient, userId: string): Promise<DomainRef[]> {
  const { data, error } = await supabase
    .from("practice_domains")
    .select("id, name, parent_id")
    .eq("user_id", userId)
    .order("name");
  if (error) throw fromDbError(error);
  return data;
}

export async function listTags(supabase: SupabaseServerClient, userId: string): Promise<TagRef[]> {
  const { data, error } = await supabase.from("tags").select("id, name, color").eq("user_id", userId).order("name");
  if (error) throw fromDbError(error);
  return data as TagRef[];
}

export type TemplateWithClassification = {
  id: string;
  name: string;
  task_type: TaskType | null;
  practice_domain_id: string | null;
  default_estimate_minutes: number | null;
  tags: TagRef[];
  /** Tasks of this template whose type or domain is still empty. */
  emptyTaskCount: number;
};

export async function listTemplatesWithClassification(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<TemplateWithClassification[]> {
  const [templates, tasks] = await Promise.all([
    supabase
      .from("task_templates")
      .select(
        "id, name, task_type, practice_domain_id, default_estimate_minutes, tags:template_tags!template_tags_template_id_user_id_fkey(tag:tags!template_tags_tag_id_user_id_fkey(id, name, color))",
      )
      .eq("user_id", userId)
      .order("name"),
    supabase
      .from("tasks")
      .select("template_id")
      .eq("user_id", userId)
      .not("template_id", "is", null)
      .or("task_type.is.null,practice_domain_id.is.null"),
  ]);
  if (templates.error) throw fromDbError(templates.error);
  if (tasks.error) throw fromDbError(tasks.error);
  const empty = new Map<string, number>();
  for (const t of tasks.data) if (t.template_id) empty.set(t.template_id, (empty.get(t.template_id) ?? 0) + 1);
  return templates.data.map((t) => ({
    id: t.id,
    name: t.name,
    task_type: t.task_type as TaskType | null,
    practice_domain_id: t.practice_domain_id,
    default_estimate_minutes: t.default_estimate_minutes,
    tags: ((t.tags ?? []) as { tag: TagRef | null }[]).map((x) => x.tag).filter((x): x is TagRef => x !== null),
    emptyTaskCount: empty.get(t.id) ?? 0,
  }));
}
