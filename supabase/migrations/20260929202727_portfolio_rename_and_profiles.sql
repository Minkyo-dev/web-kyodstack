-- ADR 0001: the portfolio `projects` table gives up its name to the scheduler `projects` table.
alter table public.projects rename to portfolio_projects;
alter policy "projects_public_read" on public.portfolio_projects rename to "portfolio_projects_public_read";
alter policy "projects_admin_write" on public.portfolio_projects rename to "portfolio_projects_admin_write";

-- Shared updated_at trigger function.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- profiles: align with spec §17.1 (display_name, timezone, updated_at).
alter table public.profiles rename column full_name to display_name;
alter table public.profiles alter column email drop not null;
alter table public.profiles
  add column timezone text not null default 'America/Toronto',
  add column updated_at timestamptz not null default now();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Replace the catch-all policy with explicit ones. Profiles are created by the
-- signup trigger, never inserted/deleted directly by users.
drop policy "profiles_own" on public.profiles;

create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Harden the existing helper flagged by the security advisor.
alter function public.is_admin() set search_path = '';
