-- ADR 0029: recurring payments (subscriptions). A subscription is a plan; each due date becomes one ordinary EXPENSE
-- transaction (source SUBSCRIPTION) so dashboards, calendar and search need no special case.

create table public.finance_subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.finance_households(id) on delete cascade,
  name varchar(100) not null check (length(trim(name)) between 1 and 100),
  amount numeric(14, 2) not null check (amount > 0),
  billing_cycle varchar(10) not null default 'MONTHLY' check (billing_cycle in ('MONTHLY', 'YEARLY')),
  -- 1–31; a month without that day charges on its last day.
  billing_day smallint not null check (billing_day between 1 and 31),
  -- Yearly plans only.
  billing_month smallint check (billing_month between 1 and 12),
  start_date date not null,
  end_date date,
  account_id uuid not null,
  category_id uuid not null,
  paid_by_user_id uuid,
  note text check (note is null or length(note) <= 2000),
  is_active boolean not null default true,
  -- Every due date up to and including this one has been charged (or deliberately skipped). Null = none yet.
  charged_through date,
  created_by_user_id uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id),
  check (end_date is null or end_date >= start_date),
  check ((billing_cycle = 'YEARLY') = (billing_month is not null)),
  foreign key (account_id, household_id) references public.finance_accounts(id, household_id),
  foreign key (category_id, household_id) references public.finance_categories(id, household_id),
  foreign key (household_id, paid_by_user_id) references public.finance_household_members(household_id, user_id)
);

create index finance_subscriptions_household_idx on public.finance_subscriptions(household_id, is_active);
create index finance_subscriptions_account_idx on public.finance_subscriptions(account_id, household_id);
create index finance_subscriptions_category_idx on public.finance_subscriptions(category_id, household_id);
create index finance_subscriptions_payer_idx on public.finance_subscriptions(household_id, paid_by_user_id);
create index finance_subscriptions_created_by_idx on public.finance_subscriptions(created_by_user_id);

create trigger finance_subscriptions_set_updated_at before update on public.finance_subscriptions
  for each row execute function public.set_updated_at();

-- A subscription's category is an expense category.
create or replace function public.finance_subscriptions_check_category()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select type from public.finance_categories where id = new.category_id) <> 'EXPENSE' then
    raise exception 'subscription category must be an expense category' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger finance_subscriptions_check_category before insert or update of category_id on public.finance_subscriptions
  for each row execute function public.finance_subscriptions_check_category();

alter table public.finance_subscriptions enable row level security;
create policy finance_subscriptions_select_member on public.finance_subscriptions
  for select to authenticated using ((select private.finance_is_member(household_id)));
create policy finance_subscriptions_insert_member on public.finance_subscriptions
  for insert to authenticated
  with check ((select private.finance_is_member(household_id)) and created_by_user_id = (select auth.uid()));
create policy finance_subscriptions_update_member on public.finance_subscriptions
  for update to authenticated
  using ((select private.finance_is_member(household_id))) with check ((select private.finance_is_member(household_id)));
create policy finance_subscriptions_delete_member on public.finance_subscriptions
  for delete to authenticated using ((select private.finance_is_member(household_id)));
revoke all on public.finance_subscriptions from anon;
-- The creator and the household never change (a table-level UPDATE grant cannot be narrowed by a column revoke).
create or replace function public.finance_subscriptions_keep_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_by_user_id := old.created_by_user_id;
  new.household_id := old.household_id;
  return new;
end;
$$;

create trigger finance_subscriptions_keep_owner before update on public.finance_subscriptions
  for each row execute function public.finance_subscriptions_keep_owner();

-- ---------------------------------------------------------------- transactions link

alter table public.finance_transactions
  add column subscription_id uuid,
  add constraint finance_transactions_subscription_fkey foreign key (subscription_id, household_id)
    references public.finance_subscriptions(id, household_id) on delete set null (subscription_id);
alter table public.finance_transactions drop constraint finance_transactions_source_check;
alter table public.finance_transactions add constraint finance_transactions_source_check
  check (source in ('MANUAL', 'CSV', 'BANK_SYNC', 'SYSTEM', 'SUBSCRIPTION'));
-- One charge per subscription per day, so a retried or concurrent run never doubles it.
create unique index finance_transactions_subscription_day_idx
  on public.finance_transactions(subscription_id, transaction_date) where subscription_id is not null;

-- ---------------------------------------------------------------- charging

-- Records every due charge of the household's active subscriptions from the day after `charged_through` (or the
-- start date) up to today in the household's timezone (or the end date), then advances `charged_through`.
-- Idempotent. Callable by a member (after a save) or by the service role (the daily job).
create or replace function private.finance_charge_subscriptions(p_household uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date;
  s public.finance_subscriptions;
  v_from date;
  v_to date;
  v_month date;
  v_day date;
  v_currency text;
  v_count integer := 0;
  v_rows integer;
begin
  if (select auth.uid()) is null then
    if coalesce((select auth.role()), '') <> 'service_role' then
      raise exception 'not allowed' using errcode = '42501';
    end if;
  elsif not private.finance_is_member(p_household) then
    raise exception 'not a member' using errcode = '42501';
  end if;

  select (now() at time zone h.timezone)::date into v_today from public.finance_households h where h.id = p_household;
  if v_today is null then
    return 0;
  end if;

  for s in
    select * from public.finance_subscriptions
    where household_id = p_household and is_active and start_date <= v_today
      and (end_date is null or charged_through is null or charged_through < end_date)
      and (charged_through is null or charged_through < v_today)
    order by id
    for update
  loop
    v_from := greatest(s.start_date, coalesce(s.charged_through + 1, s.start_date));
    v_to := least(v_today, coalesce(s.end_date, v_today));
    select currency_code into v_currency from public.finance_accounts where id = s.account_id;
    v_month := date_trunc('month', v_from)::date;
    while v_month <= v_to loop
      if s.billing_cycle = 'MONTHLY' or extract(month from v_month) = s.billing_month then
        v_day := v_month + (least(s.billing_day, extract(day from (v_month + interval '1 month - 1 day'))::int) - 1);
        if v_day between v_from and v_to then
          insert into public.finance_transactions (
            household_id, type, amount, account_id, category_id, currency_code, transaction_date,
            merchant_name, paid_by_user_id, created_by_user_id, source, subscription_id
          ) values (
            p_household, 'EXPENSE', s.amount, s.account_id, s.category_id, v_currency, v_day,
            s.name, s.paid_by_user_id, s.created_by_user_id, 'SUBSCRIPTION', s.id
          )
          on conflict (subscription_id, transaction_date) where subscription_id is not null do nothing;
          get diagnostics v_rows = row_count;
          v_count := v_count + v_rows;
        end if;
      end if;
      v_month := (v_month + interval '1 month')::date;
    end loop;
    update public.finance_subscriptions set charged_through = v_to where id = s.id;
  end loop;
  return v_count;
end;
$$;

create or replace function public.finance_charge_subscriptions(p_household uuid)
returns integer
language sql
security invoker
set search_path = ''
as $$ select private.finance_charge_subscriptions(p_household) $$;

revoke execute on function private.finance_charge_subscriptions(uuid) from public, anon;
grant execute on function private.finance_charge_subscriptions(uuid) to authenticated, service_role;
revoke execute on function public.finance_charge_subscriptions(uuid) from public, anon;
grant execute on function public.finance_charge_subscriptions(uuid) to authenticated, service_role;
grant usage on schema private to service_role;
