// Shared PostgREST select strings. Composite FKs need explicit relationship names.
// Keep each one a single literal so supabase-js can infer the row type.
export const TASK_SELECT =
  "*, template:task_templates!tasks_template_id_user_id_fkey(id, name, default_estimate_minutes), project:projects!tasks_project_id_user_id_fkey(id, name), milestone:milestones!tasks_milestone_id_user_id_fkey(id, name)";

export const BLOCK_SELECT =
  "*, task:tasks!schedule_blocks_task_id_user_id_fkey(*, template:task_templates!tasks_template_id_user_id_fkey(id, name, default_estimate_minutes), project:projects!tasks_project_id_user_id_fkey(id, name), milestone:milestones!tasks_milestone_id_user_id_fkey(id, name))";
