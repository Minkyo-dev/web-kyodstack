-- ADR 0046 V3: the vocab_due push kind (ADR 0043 rules notify-v2) and per-local-day review counts for stats.
alter table public.notification_prefs add column vocab_due boolean not null default true;
alter table public.notification_log drop constraint notification_log_kind_check;
alter table public.notification_log add constraint notification_log_kind_check
  check (kind in ('block_soon', 'habit_missed', 'checkin', 'change_quiet', 'vocab_due', 'test'));

-- Reviews per local day since p_since (DST-safe through AT TIME ZONE). "studied" = reviews of cards already in the
-- review state; studied_ok = those not rated Again (the recall rate's numerator, spec §8.3).
create or replace function public.vocab_review_days(p_user_id uuid, p_timezone text, p_since timestamptz)
returns table (local_date date, reviews integer, again integer, studied integer, studied_ok integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (r.reviewed_at at time zone p_timezone)::date as local_date,
    count(*)::integer as reviews,
    count(*) filter (where r.rating = 1)::integer as again,
    count(*) filter (where r.before->>'fsrs_state' = 'review')::integer as studied,
    count(*) filter (where r.before->>'fsrs_state' = 'review' and r.rating > 1)::integer as studied_ok
  from public.vocab_reviews r
  where r.user_id = p_user_id and r.reviewed_at >= p_since
  group by 1
  order by 1;
$$;
revoke all on function public.vocab_review_days(uuid, text, timestamptz) from public, anon;
grant execute on function public.vocab_review_days(uuid, text, timestamptz) to authenticated, service_role;
