-- ADR 0046 V1: the Notion word mirror and its two FSRS cards (recognition 영→한, recall 한→영). Notion owns word
-- content; vocab_upsert_words is the only writer used by the app (write-through results and pulls).
create table public.vocab_words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  notion_page_id text not null check (char_length(notion_page_id) between 1 and 100),
  notion_url text check (char_length(notion_url) <= 500),
  term text not null check (char_length(term) between 1 and 200),
  meaning text check (char_length(meaning) <= 1000),
  pos text check (char_length(pos) <= 50),
  ipa text check (char_length(ipa) <= 200),
  example text check (char_length(example) <= 1000),
  synonyms text check (char_length(synonyms) <= 500),
  note text check (char_length(note) <= 2000),
  topics text[] not null default '{}' check (cardinality(topics) <= 10),
  cefr text check (cefr in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  notion_status text check (char_length(notion_status) <= 100),
  notion_last_edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, notion_page_id),
  unique (id, user_id)
);
create index vocab_words_user_live_idx on public.vocab_words(user_id) where deleted_at is null;
create index vocab_words_topics_idx on public.vocab_words using gin (topics);
create index vocab_words_user_term_idx on public.vocab_words(user_id, lower(term));
alter table public.vocab_words enable row level security;
create policy vocab_words_select_own on public.vocab_words for select to authenticated using (user_id = (select auth.uid()));
create policy vocab_words_insert_own on public.vocab_words for insert to authenticated with check (user_id = (select auth.uid()));
create policy vocab_words_update_own on public.vocab_words for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy vocab_words_delete_own on public.vocab_words for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.vocab_words from anon;
create trigger vocab_words_set_updated_at before update on public.vocab_words
  for each row execute function public.set_updated_at();

create table public.vocab_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  word_id uuid not null,
  direction text not null check (direction in ('recognition', 'recall')),
  fsrs_state text not null default 'new' check (fsrs_state in ('new', 'learning', 'review', 'relearning')),
  due timestamptz not null default now(),
  stability double precision,
  difficulty double precision,
  elapsed_days integer not null default 0,
  scheduled_days integer not null default 0,
  learning_steps integer not null default 0,
  reps integer not null default 0 check (reps >= 0),
  lapses integer not null default 0 check (lapses >= 0),
  last_review timestamptz,
  suspended_at timestamptz,
  created_at timestamptz not null default now(),
  unique (word_id, direction),
  unique (id, user_id),
  foreign key (word_id, user_id) references public.vocab_words(id, user_id) on delete cascade
);
create index vocab_cards_user_due_idx on public.vocab_cards(user_id, due) where suspended_at is null;
alter table public.vocab_cards enable row level security;
create policy vocab_cards_select_own on public.vocab_cards for select to authenticated using (user_id = (select auth.uid()));
create policy vocab_cards_insert_own on public.vocab_cards for insert to authenticated with check (user_id = (select auth.uid()));
create policy vocab_cards_update_own on public.vocab_cards for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy vocab_cards_delete_own on public.vocab_cards for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.vocab_cards from anon;

-- Upserts mirror rows by (user_id, notion_page_id) and makes sure each word has both cards. An incoming page older
-- than the stored edit is ignored; a page that comes back clears deleted_at. Security invoker: RLS decides whose
-- rows may be written (the job runs it with the service role and an explicit user id).
create or replace function public.vocab_upsert_words(p_user_id uuid, p_rows jsonb)
returns setof public.vocab_words
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r jsonb;
  w public.vocab_words;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array' using errcode = '22023';
  end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    w := null;
    insert into public.vocab_words as v (
      user_id, notion_page_id, notion_url, term, meaning, pos, ipa, example, synonyms, note, topics, cefr,
      notion_status, notion_last_edited_at
    ) values (
      p_user_id, r->>'notion_page_id', r->>'notion_url', r->>'term', r->>'meaning', r->>'pos', r->>'ipa',
      r->>'example', r->>'synonyms', r->>'note',
      coalesce(array(select jsonb_array_elements_text(coalesce(r->'topics', '[]'::jsonb))), '{}'),
      r->>'cefr', r->>'notion_status', (r->>'notion_last_edited_at')::timestamptz
    )
    on conflict (user_id, notion_page_id) do update set
      notion_url = excluded.notion_url,
      term = excluded.term,
      meaning = excluded.meaning,
      pos = excluded.pos,
      ipa = excluded.ipa,
      example = excluded.example,
      synonyms = excluded.synonyms,
      note = excluded.note,
      topics = excluded.topics,
      cefr = excluded.cefr,
      notion_status = excluded.notion_status,
      notion_last_edited_at = excluded.notion_last_edited_at,
      deleted_at = null
    where v.notion_last_edited_at is null
       or excluded.notion_last_edited_at is null
       or excluded.notion_last_edited_at >= v.notion_last_edited_at
    returning * into w;
    if w.id is null then
      select * into w from public.vocab_words where user_id = p_user_id and notion_page_id = r->>'notion_page_id';
    end if;
    insert into public.vocab_cards (user_id, word_id, direction)
    values (p_user_id, w.id, 'recognition'), (p_user_id, w.id, 'recall')
    on conflict (word_id, direction) do nothing;
    return next w;
  end loop;
end;
$$;
revoke all on function public.vocab_upsert_words(uuid, jsonb) from public, anon;
grant execute on function public.vocab_upsert_words(uuid, jsonb) to authenticated, service_role;
