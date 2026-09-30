-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.access_grants enable row level security;
alter table public.invite_tokens enable row level security;
alter table public.projects enable row level security;
alter table public.blog_posts enable row level security;
alter table public.resume_profiles enable row level security;
alter table public.resume_versions enable row level security;
alter table public.private_apps enable row level security;
alter table public.site_settings enable row level security;
alter table public.audit_logs enable row level security;

-- Admin check helper function
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  );
$$ language sql security definer;

-- profiles: owner only
create policy "profiles_own" on public.profiles
  for all using (id = auth.uid());

-- user_roles: read own or admin / admin can insert
create policy "user_roles_read_own" on public.user_roles
  for select using (user_id = auth.uid() or public.is_admin());
create policy "user_roles_admin_write" on public.user_roles
  for insert with check (public.is_admin());

-- projects: published readable by anyone / admin can write
create policy "projects_public_read" on public.projects
  for select using (is_published = true or public.is_admin());
create policy "projects_admin_write" on public.projects
  for all using (public.is_admin());

-- blog_posts: published readable by anyone / admin can write
create policy "blog_posts_public_read" on public.blog_posts
  for select using (is_published = true or public.is_admin());
create policy "blog_posts_admin_write" on public.blog_posts
  for all using (public.is_admin());

-- resume_profiles: owner only
create policy "resume_profiles_own" on public.resume_profiles
  for all using (user_id = auth.uid());

-- resume_versions: owner of linked profile only
create policy "resume_versions_own" on public.resume_versions
  for all using (
    exists (
      select 1 from public.resume_profiles
      where id = resume_versions.profile_id and user_id = auth.uid()
    )
  );

-- private_apps: authenticated users can read active / admin can write
create policy "private_apps_auth_read" on public.private_apps
  for select using (auth.uid() is not null and is_active = true);
create policy "private_apps_admin_write" on public.private_apps
  for all using (public.is_admin());

-- site_settings: public read / admin write
create policy "site_settings_public_read" on public.site_settings
  for select using (true);
create policy "site_settings_admin_write" on public.site_settings
  for all using (public.is_admin());
