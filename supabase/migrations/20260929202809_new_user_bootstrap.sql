-- Create profile + scheduler settings for every auth user (new and existing).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;

  insert into public.scheduler_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Backfill users that existed before this migration.
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

insert into public.scheduler_settings (user_id)
select id from public.profiles
on conflict (user_id) do nothing;
