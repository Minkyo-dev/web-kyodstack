-- ADR 0037 §8: when a project / milestone was completed, for the 성취 로그 and work achievements.
alter table public.projects add column completed_at timestamptz;
alter table public.milestones add column completed_at timestamptz;

-- Best available signal for rows completed before this column existed.
update public.projects set completed_at = updated_at where status = 'completed';
update public.milestones set completed_at = updated_at where status = 'completed';

-- Set on the first transition into 'completed', kept while it stays there, cleared when it leaves.
create or replace function private.stamp_completed_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'completed' then
    new.completed_at := case
      when tg_op = 'UPDATE' and old.status = 'completed' then coalesce(old.completed_at, now())
      else now()
    end;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger projects_stamp_completed_at before insert or update on public.projects
  for each row execute function private.stamp_completed_at();
create trigger milestones_stamp_completed_at before insert or update on public.milestones
  for each row execute function private.stamp_completed_at();

create index projects_user_completed_idx on public.projects(user_id, completed_at) where completed_at is not null;
create index milestones_user_completed_idx on public.milestones(user_id, completed_at) where completed_at is not null;
