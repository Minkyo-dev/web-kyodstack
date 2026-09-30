-- Focus flow (sub-project A): pause intervals, work logs, atomic stop/switch, actual minutes v2.
-- Spec: docs/superpowers/specs/2026-09-29-focus-flow-design.md

alter table public.work_sessions
  add constraint work_sessions_id_user_id_key unique (id, user_id);

-- Pause intervals. Session state is derived: open pause = paused.
create table public.work_session_pauses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null,
  paused_at timestamptz not null,
  resumed_at timestamptz,
  reason text check (reason in ('coffee', 'phone', 'meeting', 'break', 'other')),
  created_at timestamptz not null default now(),
  foreign key (session_id, user_id) references public.work_sessions(id, user_id) on delete cascade,
  check (resumed_at is null or resumed_at >= paused_at)
);
create unique index work_session_pauses_one_open_idx
  on public.work_session_pauses(session_id) where resumed_at is null;
create index work_session_pauses_session_user_idx on public.work_session_pauses(session_id, user_id);

-- Work results (umbrella decision 2). At most one log per session; session_id null = task-level note.
create table public.work_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid not null,
  session_id uuid unique,
  focus_score smallint check (focus_score between 1 and 5),
  mood_score smallint check (mood_score between 1 and 5),
  energy_score smallint check (energy_score between 1 and 5),
  note text check (note is null or length(note) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (task_id, user_id) references public.tasks(id, user_id) on delete cascade,
  foreign key (session_id, user_id) references public.work_sessions(id, user_id)
    on delete set null (session_id)
);
create index work_logs_task_user_idx on public.work_logs(task_id, user_id);
create index work_logs_session_user_idx on public.work_logs(session_id, user_id);
create trigger work_logs_set_updated_at before update on public.work_logs
  for each row execute function public.set_updated_at();

alter table public.work_session_pauses enable row level security;
alter table public.work_logs enable row level security;

create policy work_session_pauses_select_own on public.work_session_pauses
  for select to authenticated using (user_id = (select auth.uid()));
create policy work_session_pauses_insert_own on public.work_session_pauses
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy work_session_pauses_update_own on public.work_session_pauses
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy work_logs_select_own on public.work_logs
  for select to authenticated using (user_id = (select auth.uid()));
create policy work_logs_insert_own on public.work_logs
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy work_logs_update_own on public.work_logs
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy work_logs_delete_own on public.work_logs
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.work_session_pauses, public.work_logs from anon;

-- Backfill (idempotent): every session with a score or note gets its log.
insert into public.work_logs (user_id, task_id, session_id, focus_score, mood_score, energy_score, note, created_at)
select user_id, task_id, id, focus_score, mood_score, energy_score, note, coalesce(ended_at, created_at)
  from public.work_sessions
 where focus_score is not null or mood_score is not null or energy_score is not null or note is not null
on conflict (session_id) do nothing;

create or replace function public.pause_work_session(p_session_id uuid, p_reason text default null)
returns public.work_session_pauses
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ended timestamptz;
  v_pause public.work_session_pauses;
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '42501';
  end if;
  select ended_at into v_ended
    from public.work_sessions
   where id = p_session_id and user_id = v_uid
   for update;
  if not found then
    raise exception 'session not found' using errcode = 'P0002';
  end if;
  if v_ended is not null then
    raise exception 'session finished' using errcode = '23514';
  end if;
  if exists (select 1 from public.work_session_pauses
              where session_id = p_session_id and resumed_at is null) then
    raise exception 'already paused' using errcode = '23514';
  end if;
  insert into public.work_session_pauses (user_id, session_id, paused_at, reason)
  values (v_uid, p_session_id, now(), p_reason)
  returning * into v_pause;
  return v_pause;
end;
$$;

create or replace function public.resume_work_session(p_session_id uuid)
returns public.work_session_pauses
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ended timestamptz;
  v_pause public.work_session_pauses;
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '42501';
  end if;
  select ended_at into v_ended
    from public.work_sessions
   where id = p_session_id and user_id = v_uid
   for update;
  if not found then
    raise exception 'session not found' using errcode = 'P0002';
  end if;
  if v_ended is not null then
    raise exception 'session finished' using errcode = '23514';
  end if;
  update public.work_session_pauses
     set resumed_at = now()
   where session_id = p_session_id and resumed_at is null
  returning * into v_pause;
  if not found then
    raise exception 'not paused' using errcode = '23514';
  end if;
  return v_pause;
end;
$$;

create or replace function public.stop_work_session(
  p_session_id uuid,
  p_ended_at timestamptz default null,
  p_focus smallint default null,
  p_mood smallint default null,
  p_energy smallint default null,
  p_note text default null,
  p_complete_task boolean default false
)
returns public.work_sessions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_session public.work_sessions;
  v_end timestamptz;
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '42501';
  end if;
  select * into v_session
    from public.work_sessions
   where id = p_session_id and user_id = v_uid
   for update;
  if not found then
    raise exception 'session not found' using errcode = 'P0002';
  end if;
  if v_session.ended_at is not null then
    raise exception 'session finished' using errcode = '23514';
  end if;

  v_end := coalesce(p_ended_at, now());
  if v_end <= v_session.started_at then
    raise exception 'end before start' using errcode = '23514';
  end if;
  if exists (select 1 from public.work_session_pauses
              where session_id = p_session_id
                and (paused_at > v_end or resumed_at > v_end)) then
    raise exception 'end before pause' using errcode = '23514';
  end if;

  update public.work_session_pauses
     set resumed_at = v_end
   where session_id = p_session_id and resumed_at is null;

  update public.work_sessions
     set ended_at = v_end
   where id = p_session_id
  returning * into v_session;

  if p_focus is not null or p_mood is not null or p_energy is not null or p_note is not null then
    insert into public.work_logs (user_id, task_id, session_id, focus_score, mood_score, energy_score, note)
    values (v_uid, v_session.task_id, p_session_id, p_focus, p_mood, p_energy, p_note)
    on conflict (session_id) do update
      set focus_score = excluded.focus_score,
          mood_score = excluded.mood_score,
          energy_score = excluded.energy_score,
          note = coalesce(excluded.note, public.work_logs.note);
  end if;

  if p_complete_task then
    update public.tasks
       set status = 'completed', completed_at = now()
     where id = v_session.task_id and user_id = v_uid
       and status in ('inbox', 'planned', 'in_progress');
  end if;

  return v_session;
end;
$$;

create or replace function public.switch_work_session(
  p_task_id uuid default null,
  p_block_id uuid default null
)
returns public.work_sessions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_open uuid;
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '42501';
  end if;
  select id into v_open
    from public.work_sessions
   where user_id = v_uid and ended_at is null
   for update;
  if not found then
    raise exception 'no open session' using errcode = 'P0002';
  end if;

  update public.work_session_pauses
     set resumed_at = now()
   where session_id = v_open and resumed_at is null;
  update public.work_sessions set ended_at = now() where id = v_open;

  return public.start_work_session(p_task_id, p_block_id);
end;
$$;

revoke execute on function public.pause_work_session(uuid, text) from public, anon;
revoke execute on function public.resume_work_session(uuid) from public, anon;
revoke execute on function public.stop_work_session(uuid, timestamptz, smallint, smallint, smallint, text, boolean)
  from public, anon;
revoke execute on function public.switch_work_session(uuid, uuid) from public, anon;
grant execute on function public.pause_work_session(uuid, text) to authenticated;
grant execute on function public.resume_work_session(uuid) to authenticated;
grant execute on function public.stop_work_session(uuid, timestamptz, smallint, smallint, smallint, text, boolean)
  to authenticated;
grant execute on function public.switch_work_session(uuid, uuid) to authenticated;

-- Actual minutes v2: focused = wall − pauses. Column order is kept; paused_minutes is appended.
create or replace view public.task_plan_actual
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
  f.average_focus,
  coalesce(r.reschedule_count, 0)::int as reschedule_count,
  t.project_id,
  t.milestone_id,
  coalesce(a.paused_minutes, 0)::numeric as paused_minutes
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
    sum(extract(epoch from (w.ended_at - w.started_at)) / 60.0 - coalesce(pz.paused, 0)) as actual_minutes,
    sum(coalesce(pz.paused, 0)) as paused_minutes,
    count(*) as session_count
  from public.work_sessions w
  left join lateral (
    select sum(extract(epoch from (least(coalesce(q.resumed_at, w.ended_at), w.ended_at)
                                   - greatest(q.paused_at, w.started_at))) / 60.0) as paused
    from public.work_session_pauses q
    where q.session_id = w.id
  ) pz on true
  where w.task_id = t.id and w.ended_at is not null
) a on true
left join lateral (
  select round(avg(l.focus_score), 2) as average_focus
  from public.work_logs l
  where l.task_id = t.id
) f on true
left join lateral (
  select count(*) as reschedule_count
  from public.schedule_block_revisions rv
  join public.schedule_blocks b on b.id = rv.schedule_block_id
  where b.task_id = t.id and rv.change_type in ('moved', 'resized')
) r on true;

revoke all on public.task_plan_actual from anon;
grant select on public.task_plan_actual to authenticated;
