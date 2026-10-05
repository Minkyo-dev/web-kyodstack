-- ADR 0046 V2: FSRS review log, study settings, the Notion write-back outbox, and the 상태 transitions on pull.
alter table public.vocab_words add column notion_next_review date;

create table public.vocab_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  card_id uuid not null,
  client_review_id uuid not null,
  rating smallint not null check (rating between 1 and 4),
  reviewed_at timestamptz not null,
  duration_ms integer check (duration_ms between 0 and 3600000),
  before jsonb not null check (jsonb_typeof(before) = 'object'),
  after jsonb not null check (jsonb_typeof(after) = 'object'),
  algo_version text not null check (char_length(algo_version) between 1 and 60),
  created_at timestamptz not null default clock_timestamp(),
  unique (user_id, client_review_id),
  foreign key (card_id, user_id) references public.vocab_cards(id, user_id) on delete cascade
);
create index vocab_reviews_user_time_idx on public.vocab_reviews(user_id, reviewed_at);
create index vocab_reviews_card_idx on public.vocab_reviews(card_id, created_at);
alter table public.vocab_reviews enable row level security;
create policy vocab_reviews_select_own on public.vocab_reviews for select to authenticated using (user_id = (select auth.uid()));
create policy vocab_reviews_insert_own on public.vocab_reviews for insert to authenticated with check (user_id = (select auth.uid()));
create policy vocab_reviews_delete_own on public.vocab_reviews for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.vocab_reviews from anon;
revoke update on public.vocab_reviews from authenticated;

create table public.vocab_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  new_per_day smallint not null default 20 check (new_per_day between 0 and 200),
  reviews_per_day smallint not null default 200 check (reviews_per_day between 1 and 1000),
  desired_retention numeric(3, 2) not null default 0.90 check (desired_retention between 0.70 and 0.97),
  directions text[] not null default '{recognition,recall}'
    check (cardinality(directions) between 1 and 2 and directions <@ array['recognition', 'recall']),
  default_cefr text not null default 'B1' check (default_cefr in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  reminder_enabled boolean not null default true,
  reminder_time time not null default '20:00',
  updated_at timestamptz not null default now()
);
alter table public.vocab_settings enable row level security;
create policy vocab_settings_select_own on public.vocab_settings for select to authenticated using (user_id = (select auth.uid()));
create policy vocab_settings_insert_own on public.vocab_settings for insert to authenticated with check (user_id = (select auth.uid()));
create policy vocab_settings_update_own on public.vocab_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.vocab_settings from anon;
create trigger vocab_settings_set_updated_at before update on public.vocab_settings
  for each row execute function public.set_updated_at();

create table public.vocab_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  word_id uuid not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  attempts smallint not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error_code text check (char_length(last_error_code) <= 60),
  done_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (word_id, user_id) references public.vocab_words(id, user_id) on delete cascade
);
create unique index vocab_outbox_pending_word_idx on public.vocab_outbox(word_id) where done_at is null;
create index vocab_outbox_due_idx on public.vocab_outbox(user_id, next_attempt_at) where done_at is null;
alter table public.vocab_outbox enable row level security;
create policy vocab_outbox_select_own on public.vocab_outbox for select to authenticated using (user_id = (select auth.uid()));
create policy vocab_outbox_insert_own on public.vocab_outbox for insert to authenticated with check (user_id = (select auth.uid()));
create policy vocab_outbox_update_own on public.vocab_outbox for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy vocab_outbox_delete_own on public.vocab_outbox for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.vocab_outbox from anon;

-- One review, atomically: lock the card, refuse a stale view (reps changed: SQLSTATE V0409), treat a repeated
-- client_review_id as done, write the new FSRS state and append the log with the row's own "before".
create or replace function public.vocab_apply_review(p_card_id uuid, p_expected_reps integer, p_card jsonb, p_review jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  c public.vocab_cards;
  v_client uuid := (p_review->>'client_review_id')::uuid;
begin
  select * into c from public.vocab_cards where id = p_card_id for update;
  if not found then
    raise exception 'card not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.vocab_reviews where user_id = c.user_id and client_review_id = v_client) then
    return jsonb_build_object('status', 'duplicate');
  end if;
  if c.reps <> p_expected_reps then
    raise exception 'card changed since it was shown' using errcode = 'V0409';
  end if;
  update public.vocab_cards set
    fsrs_state = p_card->>'fsrs_state',
    due = (p_card->>'due')::timestamptz,
    stability = (p_card->>'stability')::double precision,
    difficulty = (p_card->>'difficulty')::double precision,
    elapsed_days = (p_card->>'elapsed_days')::integer,
    scheduled_days = (p_card->>'scheduled_days')::integer,
    learning_steps = (p_card->>'learning_steps')::integer,
    reps = (p_card->>'reps')::integer,
    lapses = (p_card->>'lapses')::integer,
    last_review = (p_card->>'last_review')::timestamptz
  where id = c.id;
  insert into public.vocab_reviews (user_id, card_id, client_review_id, rating, reviewed_at, duration_ms, before, after, algo_version)
  values (
    c.user_id, c.id, v_client, (p_review->>'rating')::smallint, (p_review->>'reviewed_at')::timestamptz,
    (p_review->>'duration_ms')::integer,
    jsonb_build_object(
      'fsrs_state', c.fsrs_state, 'due', c.due, 'stability', c.stability, 'difficulty', c.difficulty,
      'elapsed_days', c.elapsed_days, 'scheduled_days', c.scheduled_days, 'learning_steps', c.learning_steps,
      'reps', c.reps, 'lapses', c.lapses, 'last_review', c.last_review
    ),
    p_card, p_review->>'algo_version'
  );
  return jsonb_build_object('status', 'applied');
end;
$$;

-- Undo the card's latest review: restore its "before" and delete it (spec §7.1).
create or replace function public.vocab_undo_review(p_card_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  c public.vocab_cards;
  r public.vocab_reviews;
begin
  select * into c from public.vocab_cards where id = p_card_id for update;
  if not found then
    raise exception 'card not found' using errcode = 'P0002';
  end if;
  select * into r from public.vocab_reviews where card_id = c.id order by created_at desc, id desc limit 1;
  if not found then
    raise exception 'nothing to undo' using errcode = 'P0002';
  end if;
  update public.vocab_cards set
    fsrs_state = r.before->>'fsrs_state',
    due = (r.before->>'due')::timestamptz,
    stability = (r.before->>'stability')::double precision,
    difficulty = (r.before->>'difficulty')::double precision,
    elapsed_days = (r.before->>'elapsed_days')::integer,
    scheduled_days = (r.before->>'scheduled_days')::integer,
    learning_steps = (r.before->>'learning_steps')::integer,
    reps = (r.before->>'reps')::integer,
    lapses = (r.before->>'lapses')::integer,
    last_review = (r.before->>'last_review')::timestamptz
  where id = c.id;
  delete from public.vocab_reviews where id = r.id;
  return jsonb_build_object('status', 'undone', 'rating', r.rating);
end;
$$;

-- One pending write-back per word; a newer desired state replaces the payload and retries now (spec §6.4).
create or replace function public.vocab_enqueue_writeback(p_user_id uuid, p_word_id uuid, p_payload jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.vocab_outbox (user_id, word_id, payload) values (p_user_id, p_word_id, p_payload)
  on conflict (word_id) where done_at is null do update
    set payload = excluded.payload, attempts = 0, next_attempt_at = now(), last_error_code = null;
$$;

-- V2 version of the mirror upsert: also stores 다음 복습 and applies the 상태 transitions made in Notion
-- (spec §6.3): becoming 학습 완료 suspends both cards; leaving it unsuspends them, due now.
create or replace function public.vocab_upsert_words(p_user_id uuid, p_rows jsonb)
returns setof public.vocab_words
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r jsonb;
  w public.vocab_words;
  v_old_status text;
  v_existed boolean;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array' using errcode = '22023';
  end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    w := null;
    v_old_status := null;
    v_existed := null;
    select notion_status, true into v_old_status, v_existed
      from public.vocab_words where user_id = p_user_id and notion_page_id = r->>'notion_page_id';
    v_existed := coalesce(v_existed, false);
    insert into public.vocab_words as v (
      user_id, notion_page_id, notion_url, term, meaning, pos, ipa, example, synonyms, note, topics, cefr,
      notion_status, notion_next_review, notion_last_edited_at
    ) values (
      p_user_id, r->>'notion_page_id', r->>'notion_url', r->>'term', r->>'meaning', r->>'pos', r->>'ipa',
      r->>'example', r->>'synonyms', r->>'note',
      coalesce(array(select jsonb_array_elements_text(coalesce(r->'topics', '[]'::jsonb))), '{}'),
      r->>'cefr', r->>'notion_status', (r->>'notion_next_review')::date, (r->>'notion_last_edited_at')::timestamptz
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
      notion_next_review = excluded.notion_next_review,
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
    if w.notion_status = '학습 완료' and (not v_existed or v_old_status is distinct from '학습 완료') then
      update public.vocab_cards set suspended_at = coalesce(suspended_at, now()) where word_id = w.id;
    elsif v_existed and v_old_status = '학습 완료' and w.notion_status is distinct from '학습 완료' then
      update public.vocab_cards set suspended_at = null, due = now() where word_id = w.id and suspended_at is not null;
    end if;
    return next w;
  end loop;
end;
$$;

revoke all on function public.vocab_apply_review(uuid, integer, jsonb, jsonb) from public, anon;
revoke all on function public.vocab_undo_review(uuid) from public, anon;
revoke all on function public.vocab_enqueue_writeback(uuid, uuid, jsonb) from public, anon;
grant execute on function public.vocab_apply_review(uuid, integer, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.vocab_undo_review(uuid) to authenticated, service_role;
grant execute on function public.vocab_enqueue_writeback(uuid, uuid, jsonb) to authenticated, service_role;
