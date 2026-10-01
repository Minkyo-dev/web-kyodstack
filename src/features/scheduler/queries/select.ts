import type { TagRef } from "@/features/classification/domain/classification.types";

// Shared PostgREST select strings. Composite FKs need explicit relationship names.
// Keep each one a single literal so supabase-js can infer the row type.
export const TASK_SELECT =
  "*, template:task_templates!tasks_template_id_user_id_fkey(id, name, default_estimate_minutes), project:projects!tasks_project_id_user_id_fkey(id, name, mission:missions!projects_mission_id_user_id_fkey(id, title, status)), milestone:milestones!tasks_milestone_id_user_id_fkey(id, name), domain:practice_domains!tasks_practice_domain_id_user_id_fkey(id, name), mission:missions!tasks_mission_id_user_id_fkey(id, title, status), protocol:protocols!tasks_protocol_id_mission_id_fkey(id, title, path:paths!protocols_path_id_mission_id_fkey(id, title, status)), tags:task_tags!task_tags_task_id_user_id_fkey(tag:tags!task_tags_tag_id_user_id_fkey(id, name, color))";

export const BLOCK_SELECT =
  "*, task:tasks!schedule_blocks_task_id_user_id_fkey(*, template:task_templates!tasks_template_id_user_id_fkey(id, name, default_estimate_minutes), project:projects!tasks_project_id_user_id_fkey(id, name, mission:missions!projects_mission_id_user_id_fkey(id, title, status)), milestone:milestones!tasks_milestone_id_user_id_fkey(id, name), domain:practice_domains!tasks_practice_domain_id_user_id_fkey(id, name), mission:missions!tasks_mission_id_user_id_fkey(id, title, status), protocol:protocols!tasks_protocol_id_mission_id_fkey(id, title, path:paths!protocols_path_id_mission_id_fkey(id, title, status)), tags:task_tags!task_tags_task_id_user_id_fkey(tag:tags!task_tags_tag_id_user_id_fkey(id, name, color)))";

/** PostgREST returns tags as join rows ({ tag }); flatten them to TagRef[]. */
export function normalizeTask<T extends { tags?: unknown }>(row: T): Omit<T, "tags"> & { tags: TagRef[] } {
  const joins = (row.tags ?? []) as { tag: TagRef | null }[];
  return { ...row, tags: joins.map((x) => x.tag).filter((t): t is TagRef => t !== null) };
}
