-- ADR 0046 V5: AI translation practice. Sessions and items are AI advice, saved so a refresh resumes; attempts keep
-- the learner's answer and the validated feedback. Nothing here changes FSRS state or Notion.
create table public.vocab_practice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  cefr text not null check (cefr in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  source text not null check (source in ('topic', 'reviewed_today', 'hard', 'manual')),
  source_ref text check (char_length(source_ref) <= 50),
  word_ids uuid[] not null check (cardinality(word_ids) between 1 and 10),
  prompt_version text not null check (char_length(prompt_version) <= 60),
  model text check (char_length(model) <= 100),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create index vocab_practice_sessions_user_idx on public.vocab_practice_sessions(user_id, created_at desc);

create table public.vocab_practice_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  position smallint not null check (position between 1 and 10),
  target_word_ids uuid[] not null check (cardinality(target_word_ids) between 1 and 2),
  prompt_ko text not null check (char_length(prompt_ko) between 1 and 300),
  hint_ko text check (char_length(hint_ko) <= 200),
  unique (id, user_id),
  unique (session_id, position),
  foreign key (session_id, user_id) references public.vocab_practice_sessions(id, user_id) on delete cascade
);

create table public.vocab_practice_attempts (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  answer text not null check (char_length(answer) between 1 and 500),
  feedback jsonb not null check (jsonb_typeof(feedback) = 'object'),
  prompt_version text check (char_length(prompt_version) <= 60),
  model text check (char_length(model) <= 100),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (item_id, user_id) references public.vocab_practice_items(id, user_id) on delete cascade
);
create index vocab_practice_attempts_item_idx on public.vocab_practice_attempts(item_id, created_at);

-- At most three attempts per item (spec §9.3).
create or replace function private.vocab_practice_attempt_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.vocab_practice_attempts where item_id = new.item_id) >= 3 then
    raise exception 'at most three attempts per item' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger vocab_practice_attempt_limit before insert on public.vocab_practice_attempts
  for each row execute function private.vocab_practice_attempt_limit();

alter table public.vocab_practice_sessions enable row level security;
alter table public.vocab_practice_items enable row level security;
alter table public.vocab_practice_attempts enable row level security;
create policy vocab_practice_sessions_select_own on public.vocab_practice_sessions for select to authenticated using (user_id = (select auth.uid()));
create policy vocab_practice_sessions_insert_own on public.vocab_practice_sessions for insert to authenticated with check (user_id = (select auth.uid()));
create policy vocab_practice_sessions_delete_own on public.vocab_practice_sessions for delete to authenticated using (user_id = (select auth.uid()));
create policy vocab_practice_items_select_own on public.vocab_practice_items for select to authenticated using (user_id = (select auth.uid()));
create policy vocab_practice_items_insert_own on public.vocab_practice_items for insert to authenticated with check (user_id = (select auth.uid()));
create policy vocab_practice_attempts_select_own on public.vocab_practice_attempts for select to authenticated using (user_id = (select auth.uid()));
create policy vocab_practice_attempts_insert_own on public.vocab_practice_attempts for insert to authenticated with check (user_id = (select auth.uid()));
revoke all on public.vocab_practice_sessions, public.vocab_practice_items, public.vocab_practice_attempts from anon;
revoke update on public.vocab_practice_sessions, public.vocab_practice_items, public.vocab_practice_attempts from authenticated;

-- A session and its items in one transaction (security invoker: RLS decides whose rows these are).
create or replace function public.vocab_create_practice(
  p_user_id uuid, p_cefr text, p_source text, p_source_ref text, p_word_ids uuid[], p_prompt_version text, p_model text, p_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session uuid;
begin
  insert into public.vocab_practice_sessions (user_id, cefr, source, source_ref, word_ids, prompt_version, model)
  values (p_user_id, p_cefr, p_source, p_source_ref, p_word_ids, p_prompt_version, p_model)
  returning id into v_session;
  insert into public.vocab_practice_items (session_id, user_id, position, target_word_ids, prompt_ko, hint_ko)
  select v_session, p_user_id, e.ordinality::smallint,
         array(select jsonb_array_elements_text(e.value->'target_word_ids'))::uuid[],
         e.value->>'prompt_ko', nullif(e.value->>'hint_ko', '')
  from jsonb_array_elements(p_items) with ordinality as e(value, ordinality);
  return v_session;
end;
$$;
revoke all on function public.vocab_create_practice(uuid, text, text, text, uuid[], text, text, jsonb) from public, anon;
grant execute on function public.vocab_create_practice(uuid, text, text, text, uuid[], text, text, jsonb) to authenticated, service_role;
