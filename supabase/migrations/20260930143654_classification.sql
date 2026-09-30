-- Classification + recommendation v2 (sub-project D1).
-- Spec: docs/superpowers/specs/2026-09-30-classification-recommendation-design.md

-- Fixed task types
alter table public.tasks add column task_type text
  check (task_type in ('reading','study','coding','debugging','documentation','writing','meeting','planning','design','research','exercise','other'));
alter table public.task_templates add column task_type text
  check (task_type in ('reading','study','coding','debugging','documentation','writing','meeting','planning','design','research','exercise','other'));

-- Practice domains (user-owned tree)
create table public.practice_domains (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60 and position('@' in name) = 0),
  parent_id uuid,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (parent_id, user_id) references public.practice_domains(id, user_id) on delete set null (parent_id),
  check (parent_id is null or parent_id <> id)
);
create unique index practice_domains_user_name_idx on public.practice_domains (user_id, lower(name));
create index practice_domains_parent_idx on public.practice_domains (parent_id, user_id);

alter table public.tasks add column practice_domain_id uuid;
alter table public.tasks add foreign key (practice_domain_id, user_id)
  references public.practice_domains(id, user_id) on delete set null (practice_domain_id);
create index tasks_domain_user_idx on public.tasks (practice_domain_id, user_id);
alter table public.task_templates add column practice_domain_id uuid;
alter table public.task_templates add foreign key (practice_domain_id, user_id)
  references public.practice_domains(id, user_id) on delete set null (practice_domain_id);

-- Tags
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100 and name !~ '[#,]'),
  color text check (color in ('gray','red','orange','yellow','green','blue','purple','pink')),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index tags_user_name_idx on public.tags (user_id, lower(name));

create table public.task_tags (
  task_id uuid not null,
  tag_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (task_id, tag_id),
  foreign key (task_id, user_id) references public.tasks(id, user_id) on delete cascade,
  foreign key (tag_id, user_id) references public.tags(id, user_id) on delete cascade
);
create index task_tags_tag_user_idx on public.task_tags (tag_id, user_id);
create index task_tags_task_user_idx on public.task_tags (task_id, user_id);

create table public.template_tags (
  template_id uuid not null,
  tag_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (template_id, tag_id),
  foreign key (template_id, user_id) references public.task_templates(id, user_id) on delete cascade,
  foreign key (tag_id, user_id) references public.tags(id, user_id) on delete cascade
);
create index template_tags_tag_user_idx on public.template_tags (tag_id, user_id);
create index template_tags_template_user_idx on public.template_tags (template_id, user_id);

-- Derived duration history per group (rebuildable cache).
create table public.duration_groups (
  user_id uuid not null references public.profiles(id) on delete cascade,
  group_key text not null check (group_key ~ '^(type:[a-z]+(\|domain:[0-9a-f-]{36})?|tag:[0-9a-f-]{36})$'),
  samples jsonb not null default '[]'::jsonb,
  sample_count integer not null default 0 check (sample_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, group_key)
);

-- RLS
alter table public.practice_domains enable row level security;
alter table public.tags enable row level security;
alter table public.task_tags enable row level security;
alter table public.template_tags enable row level security;
alter table public.duration_groups enable row level security;

do $$
declare t text;
begin
  foreach t in array array['practice_domains', 'tags', 'duration_groups'] loop
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t || '_delete_own', t);
  end loop;
  foreach t in array array['task_tags', 'template_tags'] loop
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t || '_insert_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t || '_delete_own', t);
  end loop;
end;
$$;
revoke all on public.practice_domains, public.tags, public.task_tags, public.template_tags, public.duration_groups from anon;

-- Template names → tags (idempotent). Kept as a function so the SQL test exercises the same code.
create or replace function public.backfill_template_tags(p_user_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.tags (user_id, name)
  select t.user_id, left(regexp_replace(trim(t.name), '[#,]', '', 'g'), 100)
    from public.task_templates t
   where t.user_id = p_user_id
     and length(trim(regexp_replace(t.name, '[#,]', '', 'g'))) > 0
  on conflict (user_id, lower(name)) do nothing;

  insert into public.template_tags (template_id, tag_id, user_id)
  select t.id, g.id, t.user_id
    from public.task_templates t
    join public.tags g
      on g.user_id = t.user_id and lower(g.name) = lower(left(regexp_replace(trim(t.name), '[#,]', '', 'g'), 100))
   where t.user_id = p_user_id
  on conflict do nothing;

  insert into public.task_tags (task_id, tag_id, user_id)
  select k.id, tt.tag_id, k.user_id
    from public.tasks k
    join public.template_tags tt on tt.template_id = k.template_id and tt.user_id = k.user_id
   where k.user_id = p_user_id
  on conflict do nothing;
end;
$$;
revoke execute on function public.backfill_template_tags(uuid) from public, anon, authenticated;

do $$
declare u uuid;
begin
  for u in select distinct user_id from public.task_templates loop
    perform public.backfill_template_tags(u);
  end loop;
end;
$$;
