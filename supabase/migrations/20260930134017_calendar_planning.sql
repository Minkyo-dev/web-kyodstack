-- Calendar planning (sub-project B): missed blocks, unschedule, actual-overlay setting.
-- Spec: docs/superpowers/specs/2026-09-30-calendar-planning-design.md

alter table public.schedule_blocks drop constraint schedule_blocks_status_check;
alter table public.schedule_blocks add constraint schedule_blocks_status_check
  check (status in ('planned', 'completed', 'skipped', 'cancelled', 'missed'));

alter table public.scheduler_settings
  add column show_actual_default boolean not null default false;

-- Only the system marks blocks missed. Idempotent; every statement is scoped to p_user_id, so it is
-- safe under the service role (nightly job) and restricted to self for signed-in callers.
create or replace function public.mark_missed_blocks(p_user_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is not null and v_uid <> p_user_id then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  update public.schedule_blocks b
     set status = 'missed'
   where b.user_id = p_user_id
     and b.status = 'planned'
     and b.ends_at < now()
     and not exists (
       select 1
         from public.work_sessions w
        where w.user_id = p_user_id
          and (
            w.schedule_block_id = b.id
            or (w.task_id = b.task_id
                and w.started_at >= b.starts_at - interval '30 minutes'
                and w.started_at < b.ends_at)
          )
     );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- "미배정으로": cancel a planned or missed block; an idle planned task with no other planned block
-- returns to the inbox. One transaction, with the cancel revision.
create or replace function public.unschedule_block(p_block_id uuid)
returns public.schedule_blocks
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_old public.schedule_blocks;
  v_new public.schedule_blocks;
begin
  select * into v_old
    from public.schedule_blocks
   where id = p_block_id and user_id = v_uid
   for update;
  if not found then
    raise exception 'schedule block not found' using errcode = 'P0002';
  end if;
  if v_old.status not in ('planned', 'missed') then
    raise exception 'only planned or missed blocks can be unscheduled' using errcode = '23514';
  end if;

  update public.schedule_blocks set status = 'cancelled' where id = p_block_id
  returning * into v_new;

  insert into public.schedule_block_revisions
    (user_id, schedule_block_id, change_type, actor, previous_starts_at, previous_ends_at)
  values (v_uid, p_block_id, 'cancelled', 'user', v_old.starts_at, v_old.ends_at);

  update public.tasks t
     set status = 'inbox'
   where t.id = v_old.task_id and t.user_id = v_uid and t.status = 'planned'
     and not exists (select 1 from public.schedule_blocks b
                      where b.task_id = t.id and b.user_id = v_uid and b.status = 'planned');

  return v_new;
end;
$$;

-- Same function as before, plus missed → cancelled.
create or replace function public.set_schedule_block_status(
  p_block_id uuid,
  p_status text
)
returns public.schedule_blocks
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_old public.schedule_blocks;
  v_new public.schedule_blocks;
begin
  select * into v_old
    from public.schedule_blocks
   where id = p_block_id and user_id = v_uid
   for update;

  if not found then
    raise exception 'schedule block not found' using errcode = 'P0002';
  end if;
  if p_status = v_old.status then
    return v_old;
  end if;
  if not (
    (v_old.status = 'planned' and p_status in ('completed', 'skipped', 'cancelled'))
    or (v_old.status in ('completed', 'skipped') and p_status = 'planned')
    or (v_old.status = 'missed' and p_status = 'cancelled')
  ) then
    raise exception 'invalid block status transition' using errcode = '23514';
  end if;

  update public.schedule_blocks
     set status = p_status
   where id = p_block_id
  returning * into v_new;

  if p_status = 'cancelled' then
    insert into public.schedule_block_revisions
      (user_id, schedule_block_id, change_type, actor,
       previous_starts_at, previous_ends_at)
    values (v_uid, p_block_id, 'cancelled', 'user', v_old.starts_at, v_old.ends_at);
  end if;

  return v_new;
end;
$$;

revoke execute on function public.mark_missed_blocks(uuid) from public, anon;
revoke execute on function public.unschedule_block(uuid) from public, anon;
grant execute on function public.mark_missed_blocks(uuid) to authenticated, service_role;
grant execute on function public.unschedule_block(uuid) to authenticated;
