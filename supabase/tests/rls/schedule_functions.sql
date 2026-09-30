-- Atomic schedule functions: revisions are written with every mutation,
-- and another user can never touch a block (spec §49.2 move/resize + revision).
begin;

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-4000-a000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);

insert into public.tasks (id, user_id, title)
values ('20000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000a', 'A task');

do $$
declare
  b public.schedule_blocks;
begin
  b := public.create_schedule_block('20000000-0000-4000-a000-00000000000a',
         '2026-09-29 14:00Z', '2026-09-29 15:20Z', 'duration_recommendation');
  assert (select status from public.tasks where id = b.task_id) = 'planned', 'inbox task becomes planned';
  assert (select count(*) from public.schedule_block_revisions
           where schedule_block_id = b.id and change_type = 'created') = 1, 'created revision';

  -- move: same duration
  b := public.move_schedule_block(b.id, '2026-09-29 17:00Z', '2026-09-29 18:20Z');
  assert exists (select 1 from public.schedule_block_revisions where schedule_block_id = b.id
                 and change_type = 'moved' and previous_starts_at = '2026-09-29 14:00Z'
                 and new_starts_at = '2026-09-29 17:00Z'), 'moved revision with before/after';

  -- resize
  b := public.move_schedule_block(b.id, '2026-09-29 17:00Z', '2026-09-29 18:00Z');
  assert exists (select 1 from public.schedule_block_revisions where schedule_block_id = b.id
                 and change_type = 'resized' and previous_ends_at = '2026-09-29 18:20Z'), 'resized revision';

  -- no-op move writes nothing
  perform public.move_schedule_block(b.id, '2026-09-29 17:00Z', '2026-09-29 18:00Z');
  assert (select count(*) from public.schedule_block_revisions where schedule_block_id = b.id) = 3,
    'no-op move writes no revision';

  -- invalid range is rejected by the table check
  begin
    perform public.move_schedule_block(b.id, '2026-09-29 18:00Z', '2026-09-29 17:00Z');
    raise exception 'FAIL: inverted range accepted';
  exception when check_violation then null;
  end;

  -- AI source is reserved
  begin
    perform public.create_schedule_block(b.task_id, now(), now() + interval '1 hour', 'ai_recommendation');
    raise exception 'FAIL: ai_recommendation source accepted';
  exception when check_violation then null;
  end;

  -- cancel writes a revision; cancelled blocks cannot move
  b := public.set_schedule_block_status(b.id, 'cancelled');
  assert exists (select 1 from public.schedule_block_revisions where schedule_block_id = b.id
                 and change_type = 'cancelled'), 'cancelled revision';
  begin
    perform public.move_schedule_block(b.id, '2026-09-29 19:00Z', '2026-09-29 20:00Z');
    raise exception 'FAIL: moved a cancelled block';
  exception when check_violation then null;
  end;

  perform set_config('test.block_id', b.id::text, true);
end $$;

-- User B cannot move or cancel A's block, nor schedule A's task.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000000b","role":"authenticated"}', true);

do $$
declare v_block uuid := current_setting('test.block_id')::uuid;
begin
  begin
    perform public.move_schedule_block(v_block, now(), now() + interval '1 hour');
    raise exception 'FAIL: B moved A block';
  exception when no_data_found then null;
  end;
  begin
    perform public.set_schedule_block_status(v_block, 'skipped');
    raise exception 'FAIL: B changed A block status';
  exception when no_data_found then null;
  end;
  begin
    perform public.create_schedule_block('20000000-0000-4000-a000-00000000000a', now(), now() + interval '1 hour');
    raise exception 'FAIL: B scheduled A task';
  exception when foreign_key_violation then null;
  end;
end $$;

-- anon cannot call the functions at all
reset role;
set local role anon;
do $$
begin
  perform public.create_schedule_block('20000000-0000-4000-a000-00000000000a', now(), now() + interval '1 hour');
  raise exception 'FAIL: anon executed create_schedule_block';
exception when insufficient_privilege then null;
end $$;

select 'PASS schedule_functions' as result;
rollback;
