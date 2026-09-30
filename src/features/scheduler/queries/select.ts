// Shared PostgREST select strings. Composite FKs need explicit relationship names.
export const TASK_SELECT =
  "*, template:task_templates!tasks_template_id_user_id_fkey(id, name, default_estimate_minutes)";

export const BLOCK_SELECT = `*, task:tasks!schedule_blocks_task_id_user_id_fkey(${TASK_SELECT})`;
