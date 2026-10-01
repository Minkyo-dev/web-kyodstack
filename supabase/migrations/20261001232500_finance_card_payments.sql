-- ADR 0034: credit card payment day. On each payment day the card's whole balance owed at the end of that day is
-- paid from its payment account as one TRANSFER (source CARD_PAYMENT), so the card ends the day at 0.

alter table public.finance_accounts
  -- 1–31; a month without that day pays on its last day (same rule as subscriptions).
  add column payment_day smallint check (payment_day between 1 and 31),
  add column payment_account_id uuid,
  -- Every payment day up to and including this one has been paid (or deliberately skipped). Null = not set up.
  add column paid_through date,
  add constraint finance_accounts_payment_card_check check (payment_day is null or account_type = 'CREDIT_CARD'),
  add constraint finance_accounts_payment_self_check check (payment_account_id <> id),
  -- Deleting the payment account (only possible while unused) just stops the payments.
  add constraint finance_accounts_payment_account_fkey foreign key (payment_account_id, household_id)
    references public.finance_accounts(id, household_id) on delete set null (payment_account_id);

create index finance_accounts_payment_account_idx on public.finance_accounts(payment_account_id, household_id);

-- Setting up or changing the payment never back-fills: payments start from today (a payment due today still runs).
create or replace function public.finance_accounts_payment_start()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.payment_day is null or new.payment_account_id is null then
    new.paid_through := null;
  elsif tg_op = 'INSERT' or new.payment_day is distinct from old.payment_day
        or new.payment_account_id is distinct from old.payment_account_id or old.paid_through is null then
    select (now() at time zone h.timezone)::date - 1 into new.paid_through
    from public.finance_households h where h.id = new.household_id;
  end if;
  return new;
end;
$$;

create trigger finance_accounts_payment_start
  before insert or update of payment_day, payment_account_id, paid_through on public.finance_accounts
  for each row execute function public.finance_accounts_payment_start();

alter table public.finance_transactions drop constraint finance_transactions_source_check;
alter table public.finance_transactions add constraint finance_transactions_source_check
  check (source in ('MANUAL', 'CSV', 'BANK_SYNC', 'SYSTEM', 'SUBSCRIPTION', 'CARD_PAYMENT'));
-- One payment per card per day, so a retried or concurrent run never doubles it.
create unique index finance_transactions_card_payment_day_idx
  on public.finance_transactions(transfer_account_id, transaction_date) where source = 'CARD_PAYMENT';

-- Pays every payment day after `paid_through` up to today (household timezone) for each active card that has a
-- payment account, then advances `paid_through`. Nothing is written when the card owes nothing that day.
-- Idempotent. Callable by a member (after a save, on page load) or by the service role (the daily job).
create or replace function private.finance_pay_cards(p_household uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date;
  c public.finance_accounts;
  v_month date;
  v_day date;
  v_owed numeric;
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

  for c in
    select * from public.finance_accounts
    where household_id = p_household and account_type = 'CREDIT_CARD' and is_active
      and payment_day is not null and payment_account_id is not null and paid_through < v_today
    order by id
    for update
  loop
    v_month := date_trunc('month', c.paid_through + 1)::date;
    while v_month <= v_today loop
      v_day := v_month + (least(c.payment_day, extract(day from (v_month + interval '1 month - 1 day'))::int) - 1);
      if v_day > c.paid_through and v_day <= v_today then
        select -coalesce(sum(e.effect), 0) into v_owed
        from private.finance_balance_effects(p_household, v_day) e where e.account_id = c.id;
        if v_owed > 0 then
          insert into public.finance_transactions (
            household_id, type, amount, account_id, transfer_account_id, transfer_group_id, currency_code,
            transaction_date, merchant_name, created_by_user_id, source
          ) values (
            p_household, 'TRANSFER', v_owed, c.payment_account_id, c.id, gen_random_uuid(), c.currency_code,
            v_day, c.name || ' 카드 대금', coalesce((select auth.uid()), c.owner_user_id,
              (select m.user_id from public.finance_household_members m
               where m.household_id = p_household and m.role = 'OWNER' limit 1)),
            'CARD_PAYMENT'
          )
          on conflict (transfer_account_id, transaction_date) where source = 'CARD_PAYMENT' do nothing;
          get diagnostics v_rows = row_count;
          v_count := v_count + v_rows;
        end if;
      end if;
      v_month := (v_month + interval '1 month')::date;
    end loop;
    update public.finance_accounts set paid_through = v_today where id = c.id;
  end loop;
  return v_count;
end;
$$;

create or replace function public.finance_pay_cards(p_household uuid)
returns integer
language sql
security invoker
set search_path = ''
as $$ select private.finance_pay_cards(p_household) $$;

revoke execute on function private.finance_pay_cards(uuid) from public, anon;
grant execute on function private.finance_pay_cards(uuid) to authenticated, service_role;
revoke execute on function public.finance_pay_cards(uuid) from public, anon;
grant execute on function public.finance_pay_cards(uuid) to authenticated, service_role;
