-- RLS for scheduler core (spec §19). Every table: own rows only, authenticated only.

alter table public.scheduler_settings enable row level security;
alter table public.task_templates enable row level security;
alter table public.tasks enable row level security;
alter table public.schedule_blocks enable row level security;
alter table public.schedule_block_revisions enable row level security;
alter table public.work_sessions enable row level security;
alter table public.daily_reflections enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'task_templates', 'tasks', 'schedule_blocks',
    'work_sessions', 'daily_reflections'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',
      t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))',
      t || '_delete_own', t);
  end loop;
end;
$$;

-- scheduler_settings: row is created by the signup trigger; users read/update only.
create policy "scheduler_settings_select_own" on public.scheduler_settings
  for select to authenticated using (user_id = (select auth.uid()));
create policy "scheduler_settings_update_own" on public.scheduler_settings
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- schedule_block_revisions: append-only audit log (select + insert only).
create policy "schedule_block_revisions_select_own" on public.schedule_block_revisions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "schedule_block_revisions_insert_own" on public.schedule_block_revisions
  for insert to authenticated with check (user_id = (select auth.uid()));
