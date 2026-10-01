-- ADR 0032: account balances are computed from transactions and corrected by reconciling (an ADJUSTMENT for the
-- difference). No opening-balance column is used: the first reconcile is the opening balance.

-- The last date the account was reconciled (set even when the balance already matched and nothing was written).
alter table public.finance_accounts add column reconciled_on date;

-- Effect of every transaction on each account it touches. A transfer moves money out of account_id and into
-- transfer_account_id; an adjustment carries its own sign.
create or replace function private.finance_balance_effects(p_household uuid, p_to date)
returns table (account_id uuid, day date, effect numeric, is_adjustment boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.account_id, t.transaction_date,
    case t.type
      when 'INCOME' then t.amount
      when 'EXPENSE' then -t.amount
      when 'REFUND' then t.amount
      when 'TRANSFER' then -t.amount
      else t.amount
    end,
    t.type = 'ADJUSTMENT'
  from public.finance_transactions t
  where t.household_id = p_household and t.transaction_date <= p_to
  union all
  select t.transfer_account_id, t.transaction_date, t.amount, false
  from public.finance_transactions t
  where t.household_id = p_household and t.type = 'TRANSFER' and t.transaction_date <= p_to
$$;

create or replace function private.finance_require_member(p_household uuid)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not private.finance_is_member(p_household) then
    raise exception 'not a member' using errcode = '42501';
  end if;
end;
$$;

-- Balance of every account (archived included) at the end of p_as_of.
create or replace function public.finance_account_balances(p_household uuid, p_as_of date)
returns table (account_id uuid, balance numeric, reconciled_on date)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  perform private.finance_require_member(p_household);
  return query
    select a.id, coalesce(sum(e.effect), 0)::numeric, a.reconciled_on
    from public.finance_accounts a
    left join private.finance_balance_effects(p_household, p_as_of) e on e.account_id = a.id
    where a.household_id = p_household
    group by a.id, a.reconciled_on;
end;
$$;

-- Per day in [p_from, p_to] and per account: the end-of-day balance and that day's inflow / outflow (absolute values,
-- adjustments excluded) and adjustment total.
create or replace function public.finance_daily_balances(p_household uuid, p_from date, p_to date)
returns table (day date, account_id uuid, balance numeric, inflow numeric, outflow numeric, adjustment numeric)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  perform private.finance_require_member(p_household);
  if p_to < p_from or p_to - p_from > 400 then
    raise exception 'invalid range' using errcode = '22023';
  end if;
  return query
    with eff as (
      select * from private.finance_balance_effects(p_household, p_to)
    ),
    accounts as (
      select a.id from public.finance_accounts a where a.household_id = p_household
    ),
    opening as (
      select e.account_id, sum(e.effect) as bal from eff e where e.day < p_from group by e.account_id
    ),
    daily as (
      select e.account_id, e.day,
        sum(e.effect) as net,
        coalesce(sum(e.effect) filter (where not e.is_adjustment and e.effect > 0), 0) as inflow,
        coalesce(-sum(e.effect) filter (where not e.is_adjustment and e.effect < 0), 0) as outflow,
        coalesce(sum(e.effect) filter (where e.is_adjustment), 0) as adjustment
      from eff e
      where e.day >= p_from
      group by e.account_id, e.day
    )
    select d.day::date, a.id,
      (coalesce(o.bal, 0) + sum(coalesce(dl.net, 0)) over (partition by a.id order by d.day))::numeric,
      coalesce(dl.inflow, 0)::numeric, coalesce(dl.outflow, 0)::numeric, coalesce(dl.adjustment, 0)::numeric
    from accounts a
    cross join generate_series(p_from, p_to, interval '1 day') as d(day)
    left join opening o on o.account_id = a.id
    left join daily dl on dl.account_id = a.id and dl.day = d.day::date
    order by d.day, a.id;
end;
$$;

-- Reconcile: record the difference between the actual balance and the computed one on p_date as one ADJUSTMENT.
-- Returns the difference (0 = it already matched; nothing written). The account row lock serialises concurrent runs.
create or replace function public.finance_reconcile_account(p_account uuid, p_date date, p_actual numeric)
returns numeric
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_household uuid;
  v_currency text;
  v_today date;
  v_computed numeric;
  v_diff numeric;
begin
  select a.household_id, a.currency_code into v_household, v_currency
  from public.finance_accounts a where a.id = p_account
  for update;
  if v_household is null then
    raise exception 'account not found' using errcode = 'P0002';
  end if;
  perform private.finance_require_member(v_household);

  select (now() at time zone h.timezone)::date into v_today from public.finance_households h where h.id = v_household;
  if p_date > v_today then
    raise exception 'future date' using errcode = '22023';
  end if;

  select coalesce(sum(e.effect), 0) into v_computed
  from private.finance_balance_effects(v_household, p_date) e where e.account_id = p_account;
  v_diff := round(p_actual - v_computed, 2);

  if v_diff <> 0 then
    insert into public.finance_transactions (
      household_id, type, amount, account_id, currency_code, transaction_date, merchant_name, created_by_user_id, source
    ) values (
      v_household, 'ADJUSTMENT', v_diff, p_account, v_currency, p_date, '잔액 맞추기', (select auth.uid()), 'SYSTEM'
    );
  end if;
  update public.finance_accounts
    set reconciled_on = greatest(coalesce(reconciled_on, p_date), p_date)
    where id = p_account;
  return v_diff;
end;
$$;

revoke execute on function private.finance_balance_effects(uuid, date), private.finance_require_member(uuid)
  from public, anon;
grant execute on function private.finance_balance_effects(uuid, date), private.finance_require_member(uuid)
  to authenticated;
revoke execute on function public.finance_account_balances(uuid, date), public.finance_daily_balances(uuid, date, date),
  public.finance_reconcile_account(uuid, date, numeric) from public, anon;
grant execute on function public.finance_account_balances(uuid, date), public.finance_daily_balances(uuid, date, date),
  public.finance_reconcile_account(uuid, date, numeric) to authenticated;
