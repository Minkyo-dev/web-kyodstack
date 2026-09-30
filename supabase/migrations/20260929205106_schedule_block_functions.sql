-- Atomic schedule mutations (ADR 0004, spec §56).
-- security invoker: RLS still applies; auth.uid() scopes every statement.

create or replace function public.create_schedule_block(
  p_task_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_source text default 'manual'
)
returns public.schedule_blocks
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_block public.schedule_blocks;
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '42501';
  end if;
  -- 'ai_recommendation' is reserved for the recommendation-acceptance flow (Phase 5).
  if p_source not in ('manual', 'duration_recommendation') then
    raise exception 'invalid block source' using errcode = '23514';
  end if;

  insert into public.schedule_blocks (user_id, task_id, starts_at, ends_at, source)
  values (v_uid, p_task_id, p_starts_at, p_ends_at, p_source)
  returning * into v_block;

  insert into public.schedule_block_revisions
    (user_id, schedule_block_id, change_type, actor, new_starts_at, new_ends_at)
  values (v_uid, v_block.id, 'created', 'user', v_block.starts_at, v_block.ends_at);

  -- Scheduling an inbox task makes it planned. Other statuses are left alone.
  update public.tasks
     set status = 'planned'
   where id = p_task_id and user_id = v_uid and status = 'inbox';

  return v_block;
end;
$$;

create or replace function public.move_schedule_block(
  p_block_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
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
  v_change text;
begin
  select * into v_old
    from public.schedule_blocks
   where id = p_block_id and user_id = v_uid
   for update;

  if not found then
    raise exception 'schedule block not found' using errcode = 'P0002';
  end if;
  if v_old.status <> 'planned' then
    raise exception 'only planned blocks can be moved' using errcode = '23514';
  end if;
  if v_old.starts_at = p_starts_at and v_old.ends_at = p_ends_at then
    return v_old;
  end if;

  v_change := case
    when (p_ends_at - p_starts_at) = (v_old.ends_at - v_old.starts_at) then 'moved'
    else 'resized'
  end;

  update public.schedule_blocks
     set starts_at = p_starts_at, ends_at = p_ends_at
   where id = p_block_id
  returning * into v_new;

  insert into public.schedule_block_revisions
    (user_id, schedule_block_id, change_type, actor,
     previous_starts_at, previous_ends_at, new_starts_at, new_ends_at)
  values (v_uid, p_block_id, v_change, 'user',
          v_old.starts_at, v_old.ends_at, v_new.starts_at, v_new.ends_at);

  return v_new;
end;
$$;

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
  -- planned -> completed | skipped | cancelled, and back to planned (undo).
  if p_status = v_old.status then
    return v_old;
  end if;
  if not (
    (v_old.status = 'planned' and p_status in ('completed', 'skipped', 'cancelled'))
    or (v_old.status in ('completed', 'skipped') and p_status = 'planned')
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

revoke execute on function public.create_schedule_block(uuid, timestamptz, timestamptz, text) from public, anon;
revoke execute on function public.move_schedule_block(uuid, timestamptz, timestamptz) from public, anon;
revoke execute on function public.set_schedule_block_status(uuid, text) from public, anon;
grant execute on function public.create_schedule_block(uuid, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.move_schedule_block(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.set_schedule_block_status(uuid, text) to authenticated;
