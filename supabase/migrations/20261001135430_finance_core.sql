-- Household finance (docs/household-finance-design.md, ADR 0025).
-- Tenant key is household_id, not user_id: every finance row is visible to every member of its household.

-- ---------------------------------------------------------------- tables

create table public.finance_households (
  id uuid primary key default gen_random_uuid(),
  name varchar(100) not null check (length(trim(name)) between 1 and 100),
  base_currency char(3) not null default 'CAD',
  timezone varchar(50) not null default 'America/Toronto',
  -- Shared with the partner to join (ADR 0025). Rotated by the owner.
  invite_code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 10)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.finance_household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.finance_households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role varchar(20) not null default 'MEMBER' check (role in ('OWNER', 'MEMBER')),
  -- Members cannot read each other's profiles; the household keeps its own display names.
  display_name varchar(50) not null check (length(trim(display_name)) between 1 and 50),
  joined_at timestamptz not null default now(),
  unique (household_id, user_id),
  -- MVP: one household per user (ADR 0025).
  unique (user_id)
);

create table public.finance_accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.finance_households(id) on delete cascade,
  name varchar(100) not null check (length(trim(name)) between 1 and 100),
  account_type varchar(30) not null
    check (account_type in ('CHECKING', 'SAVINGS', 'CREDIT_CARD', 'CASH', 'INVESTMENT', 'LOAN', 'OTHER')),
  institution_name varchar(100),
  currency_code char(3) not null default 'CAD',
  ownership_type varchar(20) not null default 'PERSONAL' check (ownership_type in ('PERSONAL', 'JOINT')),
  owner_user_id uuid references auth.users(id),
  initial_balance numeric(14, 2) not null default 0,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id),
  check ((ownership_type = 'PERSONAL') = (owner_user_id is not null)),
  -- The owner must be a member of the same household.
  foreign key (household_id, owner_user_id) references public.finance_household_members(household_id, user_id)
);

create table public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.finance_households(id) on delete cascade,
  parent_id uuid,
  type varchar(20) not null check (type in ('EXPENSE', 'INCOME')),
  name varchar(100) not null check (length(trim(name)) between 1 and 100),
  icon varchar(50),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id),
  check (parent_id is null or parent_id <> id),
  foreign key (parent_id, household_id) references public.finance_categories(id, household_id)
);

create table public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.finance_households(id) on delete cascade,
  account_id uuid not null,
  category_id uuid,
  type varchar(20) not null check (type in ('EXPENSE', 'INCOME', 'TRANSFER', 'REFUND', 'ADJUSTMENT')),
  amount numeric(14, 2) not null,
  currency_code char(3) not null default 'CAD',
  merchant_name varchar(150),
  description text,
  transaction_date date not null,
  transaction_time time,
  paid_by_user_id uuid references auth.users(id),
  created_by_user_id uuid not null references auth.users(id),
  updated_by_user_id uuid references auth.users(id),
  transfer_account_id uuid,
  transfer_group_id uuid,
  source varchar(20) not null default 'MANUAL' check (source in ('MANUAL', 'CSV', 'BANK_SYNC', 'SYSTEM')),
  note text check (note is null or length(note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The sign comes from the type; only an adjustment may be negative.
  check (amount > 0 or (type = 'ADJUSTMENT' and amount <> 0)),
  -- A transfer is one row: account_id = from, transfer_account_id = to (ADR 0025). It never has a category.
  check (
    (type = 'TRANSFER' and transfer_account_id is not null and transfer_account_id <> account_id
      and category_id is null and transfer_group_id is not null)
    or (type <> 'TRANSFER' and transfer_account_id is null)
  ),
  check (type not in ('INCOME', 'EXPENSE') or category_id is not null),
  -- Spec §34: account, category, transfer target and payer belong to the transaction's household.
  foreign key (account_id, household_id) references public.finance_accounts(id, household_id),
  foreign key (transfer_account_id, household_id) references public.finance_accounts(id, household_id),
  foreign key (category_id, household_id) references public.finance_categories(id, household_id),
  foreign key (household_id, paid_by_user_id) references public.finance_household_members(household_id, user_id)
);

create index finance_accounts_household_idx on public.finance_accounts(household_id, sort_order);
create index finance_accounts_owner_idx on public.finance_accounts(household_id, owner_user_id);
create index finance_categories_household_idx on public.finance_categories(household_id, type, sort_order);
create index finance_categories_parent_idx on public.finance_categories(parent_id, household_id);
create index finance_transactions_household_date_idx on public.finance_transactions(household_id, transaction_date);
create index finance_transactions_account_idx on public.finance_transactions(account_id, household_id);
create index finance_transactions_transfer_account_idx on public.finance_transactions(transfer_account_id, household_id);
create index finance_transactions_category_idx on public.finance_transactions(category_id, household_id);
create index finance_transactions_paid_by_idx on public.finance_transactions(household_id, paid_by_user_id);
create index finance_transactions_created_by_idx on public.finance_transactions(created_by_user_id);
create index finance_transactions_updated_by_idx on public.finance_transactions(updated_by_user_id);
create index finance_transactions_paid_by_user_idx on public.finance_transactions(paid_by_user_id);
create index finance_accounts_owner_user_idx on public.finance_accounts(owner_user_id);

-- ---------------------------------------------------------------- triggers

create trigger finance_households_set_updated_at before update on public.finance_households
  for each row execute function public.set_updated_at();
create trigger finance_accounts_set_updated_at before update on public.finance_accounts
  for each row execute function public.set_updated_at();
create trigger finance_categories_set_updated_at before update on public.finance_categories
  for each row execute function public.set_updated_at();
create trigger finance_transactions_set_updated_at before update on public.finance_transactions
  for each row execute function public.set_updated_at();

-- UI supports two levels (spec §7): a parent must be top-level and of the same type; a category with children
-- cannot become a child.
create or replace function public.finance_categories_check_tree()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_parent public.finance_categories;
begin
  if new.parent_id is not null then
    select * into v_parent from public.finance_categories where id = new.parent_id;
    if v_parent.parent_id is not null then
      raise exception 'category depth is limited to two levels' using errcode = '23514';
    end if;
    if v_parent.type <> new.type then
      raise exception 'parent category type mismatch' using errcode = '23514';
    end if;
    if exists (select 1 from public.finance_categories c where c.parent_id = new.id) then
      raise exception 'a category with children cannot become a child' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.type <> old.type
     and exists (select 1 from public.finance_categories c where c.parent_id = new.id) then
    raise exception 'cannot change the type of a category with children' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger finance_categories_check_tree before insert or update on public.finance_categories
  for each row execute function public.finance_categories_check_tree();

-- created_by is the caller and never changes; updated_by is stamped on every update. A category must match the
-- transaction's direction (expense/refund → EXPENSE category, income → INCOME category).
create or replace function public.finance_transactions_stamp()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_category_type text;
begin
  if tg_op = 'INSERT' then
    new.updated_by_user_id := null;
  else
    new.created_by_user_id := old.created_by_user_id;
    new.updated_by_user_id := coalesce((select auth.uid()), new.updated_by_user_id);
  end if;
  if new.category_id is not null then
    select type into v_category_type from public.finance_categories where id = new.category_id;
    if (new.type in ('EXPENSE', 'REFUND') and v_category_type <> 'EXPENSE')
       or (new.type = 'INCOME' and v_category_type <> 'INCOME') then
      raise exception 'category type mismatch' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

create trigger finance_transactions_stamp before insert or update on public.finance_transactions
  for each row execute function public.finance_transactions_stamp();

-- ---------------------------------------------------------------- membership helper

-- Security definer so the policies below can consult the member table without recursing through its RLS.
create or replace function public.finance_is_member(p_household uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.finance_household_members m
    where m.household_id = p_household and m.user_id = (select auth.uid())
  )
$$;

create or replace function public.finance_is_owner(p_household uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.finance_household_members m
    where m.household_id = p_household and m.user_id = (select auth.uid()) and m.role = 'OWNER'
  )
$$;

-- ---------------------------------------------------------------- RLS

alter table public.finance_households enable row level security;
alter table public.finance_household_members enable row level security;
alter table public.finance_accounts enable row level security;
alter table public.finance_categories enable row level security;
alter table public.finance_transactions enable row level security;

create policy finance_households_select_member on public.finance_households
  for select to authenticated using ((select public.finance_is_member(id)));
create policy finance_households_update_owner on public.finance_households
  for update to authenticated using ((select public.finance_is_owner(id))) with check ((select public.finance_is_owner(id)));

create policy finance_members_select_member on public.finance_household_members
  for select to authenticated using ((select public.finance_is_member(household_id)));
-- Each member edits only their own display name (column grant below).
create policy finance_members_update_self on public.finance_household_members
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['finance_accounts', 'finance_categories'] loop
    execute format('create policy %I on public.%I for select to authenticated using ((select public.finance_is_member(household_id)))', t || '_select_member', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.finance_is_member(household_id)))', t || '_insert_member', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.finance_is_member(household_id))) with check ((select public.finance_is_member(household_id)))', t || '_update_member', t);
  end loop;
end $$;
-- Accounts and categories are archived, never deleted (spec §6, §25): no delete policy.

create policy finance_transactions_select_member on public.finance_transactions
  for select to authenticated using ((select public.finance_is_member(household_id)));
create policy finance_transactions_insert_member on public.finance_transactions
  for insert to authenticated
  with check ((select public.finance_is_member(household_id)) and created_by_user_id = (select auth.uid()));
create policy finance_transactions_update_member on public.finance_transactions
  for update to authenticated
  using ((select public.finance_is_member(household_id))) with check ((select public.finance_is_member(household_id)));
create policy finance_transactions_delete_member on public.finance_transactions
  for delete to authenticated using ((select public.finance_is_member(household_id)));

revoke all on public.finance_households, public.finance_household_members, public.finance_accounts,
  public.finance_categories, public.finance_transactions from anon;
-- Households and members are created through the RPCs below; only these columns are directly editable.
revoke insert, update, delete on public.finance_households, public.finance_household_members from authenticated;
grant update (name) on public.finance_households to authenticated;
grant update (display_name) on public.finance_household_members to authenticated;
revoke delete on public.finance_accounts, public.finance_categories from authenticated;

-- ---------------------------------------------------------------- household RPCs

-- Creates the household, makes the caller its OWNER and seeds the shared default categories (spec §7), atomically.
create or replace function public.finance_create_household(p_name text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_household uuid;
  v_parent uuid;
  v_group record;
  v_child text;
  v_i int := 0;
  v_j int;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if exists (select 1 from public.finance_household_members where user_id = v_user) then
    raise exception 'already in a household' using errcode = '23505';
  end if;

  insert into public.finance_households (name) values (trim(p_name)) returning id into v_household;
  insert into public.finance_household_members (household_id, user_id, role, display_name)
  values (v_household, v_user, 'OWNER', trim(p_display_name));

  for v_group in
    select * from (values
      ('EXPENSE', '식비', '🍽️', array['장보기', '외식', '배달', '커피']),
      ('EXPENSE', '주거', '🏠', array['월세', '공과금', '인터넷']),
      ('EXPENSE', '교통', '🚇', array['대중교통', '택시', '주차']),
      ('EXPENSE', '쇼핑', '🛍️', array[]::text[]),
      ('EXPENSE', '여가', '🎬', array[]::text[]),
      ('EXPENSE', '기타 지출', '📦', array[]::text[]),
      ('INCOME', '급여', '💼', array[]::text[]),
      ('INCOME', '보너스', '🎁', array[]::text[]),
      ('INCOME', '부업', '🧑‍💻', array[]::text[]),
      ('INCOME', '투자', '📈', array[]::text[]),
      ('INCOME', '기타 수입', '💰', array[]::text[])
    ) as g(type, name, icon, children)
  loop
    insert into public.finance_categories (household_id, type, name, icon, sort_order)
    values (v_household, v_group.type, v_group.name, v_group.icon, v_i)
    returning id into v_parent;
    v_i := v_i + 1;
    v_j := 0;
    foreach v_child in array v_group.children loop
      insert into public.finance_categories (household_id, parent_id, type, name, sort_order)
      values (v_household, v_parent, v_group.type, v_child, v_j);
      v_j := v_j + 1;
    end loop;
  end loop;

  return v_household;
end $$;

-- Joins the household that owns the invite code as a MEMBER.
create or replace function public.finance_join_household(p_code text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_household uuid;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if exists (select 1 from public.finance_household_members where user_id = v_user) then
    raise exception 'already in a household' using errcode = '23505';
  end if;
  select id into v_household from public.finance_households where invite_code = upper(trim(p_code));
  if v_household is null then
    raise exception 'invite code not found' using errcode = 'P0002';
  end if;
  insert into public.finance_household_members (household_id, user_id, role, display_name)
  values (v_household, v_user, 'MEMBER', trim(p_display_name));
  return v_household;
end $$;

-- Owner only: replaces the invite code so an old one stops working.
create or replace function public.finance_rotate_invite_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_household uuid;
  v_code text := upper(substr(md5(gen_random_uuid()::text), 1, 10));
begin
  select household_id into v_household from public.finance_household_members
  where user_id = v_user and role = 'OWNER';
  if v_household is null then
    raise exception 'not the household owner' using errcode = '42501';
  end if;
  update public.finance_households set invite_code = v_code where id = v_household;
  return v_code;
end $$;

-- Reorders siblings in one statement: sort_order = position in p_ids. RLS scopes the update to the caller's household.
create or replace function public.finance_reorder(p_table text, p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_table = 'accounts' then
    update public.finance_accounts a set sort_order = o.ord - 1
    from unnest(p_ids) with ordinality as o(id, ord) where a.id = o.id;
  elsif p_table = 'categories' then
    update public.finance_categories c set sort_order = o.ord - 1
    from unnest(p_ids) with ordinality as o(id, ord) where c.id = o.id;
  else
    raise exception 'unknown table' using errcode = '22023';
  end if;
end $$;

-- ---------------------------------------------------------------- aggregation (spec §29)

-- The one cash-flow rule shared by the dashboard and the calendar:
--   INCOME → income; EXPENSE → expense; REFUND → negative expense (offset); TRANSFER, ADJUSTMENT → excluded.
-- Security invoker: RLS limits rows to the caller's household.
create or replace function public.finance_cash_flow(p_household uuid, p_from date, p_to date)
returns table (transaction_date date, category_id uuid, income numeric, expense numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    t.transaction_date,
    t.category_id,
    case when t.type = 'INCOME' then t.amount else 0 end,
    case when t.type = 'EXPENSE' then t.amount when t.type = 'REFUND' then -t.amount else 0 end
  from public.finance_transactions t
  where t.household_id = p_household
    and t.transaction_date between p_from and p_to
    and t.type in ('INCOME', 'EXPENSE', 'REFUND')
$$;

create or replace function public.finance_daily_totals(p_household uuid, p_from date, p_to date)
returns table (day date, income numeric, expense numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select f.transaction_date, sum(f.income), sum(f.expense)
  from public.finance_cash_flow(p_household, p_from, p_to) f
  group by f.transaction_date
  order by f.transaction_date
$$;

create or replace function public.finance_monthly_totals(p_household uuid, p_year int)
returns table (month int, income numeric, expense numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select extract(month from f.transaction_date)::int, sum(f.income), sum(f.expense)
  from public.finance_cash_flow(p_household, make_date(p_year, 1, 1), make_date(p_year, 12, 31)) f
  group by 1
  order by 1
$$;

-- Expense by top-level category (a subcategory rolls up into its parent).
create or replace function public.finance_category_totals(p_household uuid, p_from date, p_to date)
returns table (category_id uuid, expense numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(c.parent_id, c.id), sum(f.expense)
  from public.finance_cash_flow(p_household, p_from, p_to) f
  join public.finance_categories c on c.id = f.category_id
  where f.expense <> 0
  group by 1
$$;

revoke execute on function public.finance_is_member(uuid), public.finance_is_owner(uuid),
  public.finance_create_household(text, text), public.finance_join_household(text, text),
  public.finance_rotate_invite_code(), public.finance_reorder(text, uuid[]),
  public.finance_cash_flow(uuid, date, date), public.finance_daily_totals(uuid, date, date),
  public.finance_monthly_totals(uuid, int), public.finance_category_totals(uuid, date, date)
  from public, anon;
grant execute on function public.finance_is_member(uuid), public.finance_is_owner(uuid),
  public.finance_create_household(text, text), public.finance_join_household(text, text),
  public.finance_rotate_invite_code(), public.finance_reorder(text, uuid[]),
  public.finance_cash_flow(uuid, date, date), public.finance_daily_totals(uuid, date, date),
  public.finance_monthly_totals(uuid, int), public.finance_category_totals(uuid, date, date)
  to authenticated;
