-- profiles
create table public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz default now() not null
);

-- user roles
create table public.user_roles (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  role text not null check (role in ('admin', 'member')),
  created_at timestamptz default now() not null,
  unique(user_id, role)
);

-- access grants
create table public.access_grants (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  resource text not null,
  granted_by uuid references auth.users not null,
  created_at timestamptz default now() not null
);

-- invite tokens
create table public.invite_tokens (
  id uuid default gen_random_uuid() primary key,
  token text not null unique,
  email text,
  role text not null default 'member',
  used_at timestamptz,
  expires_at timestamptz not null,
  created_by uuid references auth.users not null,
  created_at timestamptz default now() not null
);

-- projects
create table public.projects (
  id uuid default gen_random_uuid() primary key,
  slug text not null unique,
  title text not null,
  summary text,
  content text,
  tech_stack text[],
  cover_image_url text,
  demo_url text,
  github_url text,
  is_published boolean default false not null,
  is_featured boolean default false not null,
  published_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- blog posts
create table public.blog_posts (
  id uuid default gen_random_uuid() primary key,
  slug text not null unique,
  title text not null,
  summary text,
  content text,
  tags text[],
  cover_image_url text,
  is_published boolean default false not null,
  published_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- resume profiles
create table public.resume_profiles (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  email text,
  phone text,
  summary text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- resume versions
create table public.resume_versions (
  id uuid default gen_random_uuid() primary key,
  profile_id uuid references public.resume_profiles on delete cascade not null,
  title text not null,
  data jsonb not null default '{}',
  is_latest boolean default false not null,
  created_at timestamptz default now() not null
);

-- private apps
create table public.private_apps (
  id uuid default gen_random_uuid() primary key,
  slug text not null unique,
  name text not null,
  description text,
  url text,
  icon_url text,
  is_active boolean default true not null,
  created_at timestamptz default now() not null
);

-- site settings
create table public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now() not null
);

-- audit logs
create table public.audit_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users,
  action text not null,
  resource text not null,
  resource_id text,
  metadata jsonb,
  created_at timestamptz default now() not null
);
