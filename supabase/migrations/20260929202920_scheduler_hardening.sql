-- Advisor follow-ups for scheduler core.

-- Scheduler data is login-only: anon gets no table privileges at all
-- (RLS already returns zero rows; this also hides the tables from anon GraphQL).
revoke all on table
  public.profiles,
  public.scheduler_settings,
  public.task_templates,
  public.tasks,
  public.schedule_blocks,
  public.schedule_block_revisions,
  public.work_sessions,
  public.daily_reflections
from anon;

-- Covering indexes for composite ownership FKs (column order must match the FK).
drop index if exists public.schedule_blocks_task_idx;
create index schedule_blocks_task_user_idx on public.schedule_blocks(task_id, user_id);

drop index if exists public.work_sessions_block_idx;
create index work_sessions_block_user_idx on public.work_sessions(schedule_block_id, user_id);
create index work_sessions_task_user_idx on public.work_sessions(task_id, user_id);

create index schedule_revisions_block_user_idx
  on public.schedule_block_revisions(schedule_block_id, user_id);
create index schedule_revisions_user_idx on public.schedule_block_revisions(user_id);

create index tasks_template_user_idx on public.tasks(template_id, user_id);
