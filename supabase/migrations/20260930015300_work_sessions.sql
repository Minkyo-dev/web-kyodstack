-- Phase 2: actual work tracking (spec §24, §21).

-- Start a timer atomically: insert the running session and move the task to in_progress.
-- The partial unique index work_sessions_one_active_per_user_idx rejects a second
-- running timer with 23505, and the service maps that to ACTIVE_TIMER_EXISTS.
create or replace function public.start_work_session(
  p_task_id uuid,
  p_block_id uuid default null
)
returns public.work_sessions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_task_id uuid := p_task_id;
  v_status text;
  v_session public.work_sessions;
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '42501';
  end if;

  -- Starting from a block links both ids (spec §24); the block decides the task.
  if p_block_id is not null then
    select task_id into v_task_id
      from public.schedule_blocks
     where id = p_block_id and user_id = v_uid;
    if not found then
      raise exception 'schedule block not found' using errcode = 'P0002';
    end if;
    if p_task_id is not null and p_task_id <> v_task_id then
      raise exception 'block belongs to another task' using errcode = '23514';
    end if;
  end if;

  select status into v_status
    from public.tasks
   where id = v_task_id and user_id = v_uid
   for update;
  if not found then
    raise exception 'task not found' using errcode = 'P0002';
  end if;
  if v_status in ('completed', 'cancelled') then
    raise exception 'task is closed' using errcode = '23514';
  end if;

  insert into public.work_sessions (user_id, task_id, schedule_block_id, started_at, source)
  values (v_uid, v_task_id, p_block_id, now(), 'timer')
  returning * into v_session;

  update public.tasks
     set status = 'in_progress'
   where id = v_task_id and status in ('inbox', 'planned');

  return v_session;
end;
$$;

revoke execute on function public.start_work_session(uuid, uuid) from public, anon;
grant execute on function public.start_work_session(uuid, uuid) to authenticated;

-- Per-task plan vs actual (spec §21.2). Derived and never stored.
-- security_invoker makes RLS on the underlying tables apply to the caller.
create view public.task_plan_actual
with (security_invoker = true) as
select
  t.id as task_id,
  t.user_id,
  t.template_id,
  t.complexity,
  t.user_estimated_minutes,
  t.status,
  t.completed_at,
  coalesce(p.planned_minutes, 0)::numeric as planned_minutes,
  coalesce(p.skipped_minutes, 0)::numeric as skipped_minutes,
  coalesce(a.actual_minutes, 0)::numeric as actual_minutes,
  coalesce(a.session_count, 0)::int as session_count,
  a.average_focus,
  coalesce(r.reschedule_count, 0)::int as reschedule_count
from public.tasks t
left join lateral (
  select
    sum(extract(epoch from (b.ends_at - b.starts_at)) / 60.0) as planned_minutes,
    sum(extract(epoch from (b.ends_at - b.starts_at)) / 60.0)
      filter (where b.status = 'skipped') as skipped_minutes
  from public.schedule_blocks b
  where b.task_id = t.id and b.status <> 'cancelled'
) p on true
left join lateral (
  select
    sum(extract(epoch from (w.ended_at - w.started_at)) / 60.0) as actual_minutes,
    count(*) as session_count,
    round(avg(w.focus_score), 2) as average_focus
  from public.work_sessions w
  where w.task_id = t.id and w.ended_at is not null
) a on true
left join lateral (
  select count(*) as reschedule_count
  from public.schedule_block_revisions rv
  join public.schedule_blocks b on b.id = rv.schedule_block_id
  where b.task_id = t.id and rv.change_type in ('moved', 'resized')
) r on true;

revoke all on public.task_plan_actual from anon;
grant select on public.task_plan_actual to authenticated;
