-- F1: task_features / ai_calls RLS, one open proposal per (task, feature type), work_logs columns.
begin;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-a000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated');
insert into public.tasks (id, user_id, title) values
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-00000000000a', 'A task'),
  ('00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-00000000000b', 'B task');
insert into public.task_features (user_id, task_id, feature_type, feature_value, source, status)
values ('00000000-0000-4000-a000-00000000000b', '00000000-0000-4000-b000-000000000002', 'task_type', '"coding"', 'ai', 'proposed');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
do $$ begin
  insert into public.task_features (user_id, task_id, feature_type, feature_value, source, status, confidence, model, prompt_version)
  values ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-b000-000000000001', 'task_type', '"debugging"', 'ai', 'proposed', 0.9, 'fake-1', 'classify-v1');
  begin
    insert into public.task_features (user_id, task_id, feature_type, feature_value, source, status)
    values ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-b000-000000000001', 'task_type', '"coding"', 'ai', 'proposed');
    raise exception 'FAIL: two open proposals';
  exception when unique_violation then null; end;
  update public.task_features set status = 'rejected', decided_at = now() where task_id = '00000000-0000-4000-b000-000000000001';
  insert into public.task_features (user_id, task_id, feature_type, feature_value, source, status)
  values ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-b000-000000000001', 'task_type', '"coding"', 'ai', 'proposed');
  assert (select count(*) from public.task_features) = 2, 'A sees only own rows';
  begin
    insert into public.task_features (user_id, task_id, feature_type, feature_value, source, status)
    values ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-b000-000000000002', 'domain', '"x"', 'ai', 'proposed');
    raise exception 'FAIL: proposal on another user''s task';
  exception when foreign_key_violation or insufficient_privilege then null; end;
  begin
    insert into public.task_features (user_id, task_id, feature_type, feature_value, source, status)
    values ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-b000-000000000001', 'mood', '1', 'ai', 'proposed');
    raise exception 'FAIL: unknown feature type';
  exception when check_violation then null; end;
  insert into public.ai_calls (user_id, kind, model, ok) values ('00000000-0000-4000-a000-00000000000a', 'classify', 'fake-1', true);
  assert (select count(*) from public.ai_calls) = 1, 'own ai_calls';
  begin
    insert into public.ai_calls (user_id, kind, ok) values ('00000000-0000-4000-a000-00000000000b', 'classify', true);
    raise exception 'FAIL: ai_calls for another user';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  assert (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'work_logs'
          and column_name in ('ai_interpretation', 'interpretation_model', 'interpretation_version', 'confirmed_blocker')) = 4, 'work_logs columns';
end $$;
rollback;
