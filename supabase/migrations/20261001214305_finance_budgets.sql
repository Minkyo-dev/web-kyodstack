-- ADR 0033: monthly budgets per top-level expense category. A DEFAULT row applies from its month onwards until a
-- later DEFAULT; a MONTH row overrides one month. A null amount means "no budget" (from that month, or that month).

create table public.finance_budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.finance_households(id) on delete cascade,
  category_id uuid not null,
  month date not null check (extract(day from month) = 1),
  kind varchar(10) not null check (kind in ('DEFAULT', 'MONTH')),
  amount numeric(14, 2) check (amount is null or amount > 0),
  created_by_user_id uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, category_id, kind, month),
  foreign key (category_id, household_id) references public.finance_categories(id, household_id) on delete cascade
);

create index finance_budgets_category_idx on public.finance_budgets(category_id, household_id);
create index finance_budgets_created_by_idx on public.finance_budgets(created_by_user_id);

create trigger finance_budgets_set_updated_at before update on public.finance_budgets
  for each row execute function public.set_updated_at();

-- Budgets belong to top-level, non-deleted expense categories.
create or replace function public.finance_budgets_check_category()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c record;
begin
  select type, parent_id, deleted_at into c from public.finance_categories where id = new.category_id;
  if c.type is distinct from 'EXPENSE' or c.parent_id is not null or c.deleted_at is not null then
    raise exception 'budget category must be a top-level expense category' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger finance_budgets_check_category before insert or update of category_id on public.finance_budgets
  for each row execute function public.finance_budgets_check_category();

-- The creator and the household never change.
create or replace function public.finance_budgets_keep_owner()
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

create trigger finance_budgets_keep_owner before update on public.finance_budgets
  for each row execute function public.finance_budgets_keep_owner();

alter table public.finance_budgets enable row level security;
create policy finance_budgets_select_member on public.finance_budgets
  for select to authenticated using ((select private.finance_is_member(household_id)));
create policy finance_budgets_insert_member on public.finance_budgets
  for insert to authenticated
  with check ((select private.finance_is_member(household_id)) and created_by_user_id = (select auth.uid()));
create policy finance_budgets_update_member on public.finance_budgets
  for update to authenticated
  using ((select private.finance_is_member(household_id))) with check ((select private.finance_is_member(household_id)));
create policy finance_budgets_delete_member on public.finance_budgets
  for delete to authenticated using ((select private.finance_is_member(household_id)));
revoke all on public.finance_budgets from anon;

-- The effective budget per category for p_month (any day of the month): the MONTH row, else the latest DEFAULT row at
-- or before it; null amounts and categories that are no longer top-level expense categories are dropped.
create or replace function public.finance_month_budgets(p_household uuid, p_month date)
returns table (category_id uuid, amount numeric, is_override boolean, default_amount numeric)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_month date := date_trunc('month', p_month)::date;
begin
  perform private.finance_require_member(p_household);
  return query
    with defaults as (
      select distinct on (b.category_id) b.category_id, b.amount
      from public.finance_budgets b
      where b.household_id = p_household and b.kind = 'DEFAULT' and b.month <= v_month
      order by b.category_id, b.month desc
    ),
    overrides as (
      select b.category_id, b.amount
      from public.finance_budgets b
      where b.household_id = p_household and b.kind = 'MONTH' and b.month = v_month
    ),
    merged as (
      select coalesce(o.category_id, d.category_id) as category_id,
        case when o.category_id is not null then o.amount else d.amount end as amount,
        o.category_id is not null as is_override,
        d.amount as default_amount
      from defaults d
      full join overrides o on o.category_id = d.category_id
    )
    select m.category_id, m.amount, m.is_override, m.default_amount
    from merged m
    join public.finance_categories c on c.id = m.category_id
    where m.amount is not null and c.type = 'EXPENSE' and c.parent_id is null and c.deleted_at is null;
end;
$$;

revoke execute on function public.finance_month_budgets(uuid, date) from public, anon;
grant execute on function public.finance_month_budgets(uuid, date) to authenticated;
