-- Project archive (ADR 0024): independent of status; archived projects leave the main list and the pickers.
alter table public.projects add column archived_at timestamptz;
create index projects_user_archived_idx on public.projects(user_id, archived_at);
