-- Household finance (ADR 0025): membership-based RLS, household integrity, the shared cash-flow rule.
-- A owns household H1, B joins it with the invite code, C owns another household H2.
begin;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-a000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000c', 'rls-c@test.local', 'authenticated', 'authenticated');

create temp table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated;

set local role authenticated;

-- C creates H2 with one account.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000c","role":"authenticated"}', true);
insert into ids values ('h2', public.finance_create_household('C home', 'C'));
with x as (
  insert into public.finance_accounts (household_id, name, account_type, ownership_type, owner_user_id)
  values ((select v from ids where k = 'h2'), 'C bank', 'CHECKING', 'PERSONAL', '00000000-0000-4000-a000-00000000000c')
  returning id)
insert into ids select 'c_acct', id from x;
insert into ids select 'c_cat', id from public.finance_categories
  where household_id = (select v from ids where k = 'h2') and name = '쇼핑';

-- A creates H1: OWNER membership and seeded categories.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
insert into ids values ('h1', public.finance_create_household('A home', 'A'));
do $$ begin
  assert (select role from public.finance_household_members where user_id = '00000000-0000-4000-a000-00000000000a') = 'OWNER', 'A is owner';
  assert (select count(*) from public.finance_categories) > 10, 'categories seeded';
  assert (select count(*) from public.finance_households) = 1, 'A sees only H1';
  assert (select count(*) from public.finance_accounts) = 0, 'A cannot see C accounts';
end $$;
do $$ begin
  perform public.finance_create_household('second', 'A');
  raise exception 'A created a second household';
exception when unique_violation then null;
end $$;
-- Households/members cannot be inserted directly.
do $$ begin
  insert into public.finance_households (name) values ('direct');
  raise exception 'direct household insert allowed';
exception when insufficient_privilege then null;
end $$;

with x as (
  insert into public.finance_accounts (household_id, name, account_type, ownership_type, owner_user_id)
  values ((select v from ids where k = 'h1'), 'A card', 'CREDIT_CARD', 'PERSONAL', '00000000-0000-4000-a000-00000000000a')
  returning id)
insert into ids select 'a_acct', id from x;
with x as (
  insert into public.finance_accounts (household_id, name, account_type, ownership_type)
  values ((select v from ids where k = 'h1'), 'Joint', 'SAVINGS', 'JOINT')
  returning id)
insert into ids select 'joint', id from x;
insert into ids select 'food', id from public.finance_categories where household_id = (select v from ids where k = 'h1') and name = '식비';
insert into ids select 'grocery', id from public.finance_categories where household_id = (select v from ids where k = 'h1') and name = '장보기';
insert into ids select 'salary', id from public.finance_categories where household_id = (select v from ids where k = 'h1') and name = '급여';

-- Ownership rules: PERSONAL needs an owner who is a member; JOINT has none.
do $$ begin
  insert into public.finance_accounts (household_id, name, account_type, ownership_type)
  values ((select v from ids where k = 'h1'), 'x', 'CASH', 'PERSONAL');
  raise exception 'personal account without owner';
exception when check_violation then null;
end $$;
do $$ begin
  insert into public.finance_accounts (household_id, name, account_type, ownership_type, owner_user_id)
  values ((select v from ids where k = 'h1'), 'x', 'CASH', 'PERSONAL', '00000000-0000-4000-a000-00000000000c');
  raise exception 'owner from another household';
exception when foreign_key_violation then null;
end $$;

-- A cannot write into H2.
do $$ begin
  insert into public.finance_accounts (household_id, name, account_type, ownership_type)
  values ((select v from ids where k = 'h2'), 'x', 'CASH', 'JOINT');
  raise exception 'A inserted into H2';
exception when insufficient_privilege then null;
end $$;

-- Transactions: a cross-household account or category is rejected; created_by cannot be spoofed.
do $$ begin
  insert into public.finance_transactions (household_id, account_id, category_id, type, amount, transaction_date, created_by_user_id)
  values ((select v from ids where k = 'h1'), (select v from ids where k = 'c_acct'), (select v from ids where k = 'grocery'),
          'EXPENSE', 10, '2026-10-01', '00000000-0000-4000-a000-00000000000a');
  raise exception 'cross-household account';
exception when foreign_key_violation then null;
end $$;
do $$ begin
  insert into public.finance_transactions (household_id, account_id, category_id, type, amount, transaction_date, created_by_user_id)
  values ((select v from ids where k = 'h1'), (select v from ids where k = 'a_acct'), (select v from ids where k = 'c_cat'),
          'EXPENSE', 10, '2026-10-01', '00000000-0000-4000-a000-00000000000a');
  raise exception 'cross-household category';
exception when foreign_key_violation then null;
end $$;
do $$ begin
  insert into public.finance_transactions (household_id, account_id, category_id, type, amount, transaction_date, created_by_user_id, paid_by_user_id)
  values ((select v from ids where k = 'h1'), (select v from ids where k = 'a_acct'), (select v from ids where k = 'grocery'),
          'EXPENSE', 10, '2026-10-01', '00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000c');
  raise exception 'payer outside the household';
exception when foreign_key_violation then null;
end $$;
do $$ begin
  insert into public.finance_transactions (household_id, account_id, category_id, type, amount, transaction_date, created_by_user_id)
  values ((select v from ids where k = 'h1'), (select v from ids where k = 'a_acct'), (select v from ids where k = 'grocery'),
          'EXPENSE', 10, '2026-10-01', '00000000-0000-4000-a000-00000000000b');
  raise exception 'spoofed created_by';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  insert into public.finance_transactions (household_id, account_id, category_id, type, amount, transaction_date, created_by_user_id)
  values ((select v from ids where k = 'h1'), (select v from ids where k = 'a_acct'), (select v from ids where k = 'salary'),
          'EXPENSE', 10, '2026-10-01', '00000000-0000-4000-a000-00000000000a');
  raise exception 'income category on an expense';
exception when check_violation then null;
end $$;
do $$ begin
  insert into public.finance_categories (household_id, parent_id, type, name)
  values ((select v from ids where k = 'h1'), (select v from ids where k = 'grocery'), 'EXPENSE', 'third level');
  raise exception 'three levels';
exception when check_violation then null;
end $$;

-- Cash flow on 2026-10-05: income 4200, expense 100, refund 30, transfer 1000 (excluded).
insert into public.finance_transactions (household_id, account_id, category_id, type, amount, transaction_date, created_by_user_id, paid_by_user_id)
values
  ((select v from ids where k = 'h1'), (select v from ids where k = 'joint'), (select v from ids where k = 'salary'), 'INCOME', 4200, '2026-10-05', '00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000a'),
  ((select v from ids where k = 'h1'), (select v from ids where k = 'a_acct'), (select v from ids where k = 'grocery'), 'EXPENSE', 100, '2026-10-05', '00000000-0000-4000-a000-00000000000a', null),
  ((select v from ids where k = 'h1'), (select v from ids where k = 'a_acct'), (select v from ids where k = 'grocery'), 'REFUND', 30, '2026-10-05', '00000000-0000-4000-a000-00000000000a', null);
insert into public.finance_transactions (household_id, account_id, transfer_account_id, transfer_group_id, type, amount, transaction_date, created_by_user_id)
values ((select v from ids where k = 'h1'), (select v from ids where k = 'joint'), (select v from ids where k = 'a_acct'), gen_random_uuid(), 'TRANSFER', 1000, '2026-10-05', '00000000-0000-4000-a000-00000000000a');
do $$ declare r record; begin
  select * into r from public.finance_daily_totals((select v from ids where k = 'h1'), '2026-10-01', '2026-10-31');
  assert r.day = '2026-10-05' and r.income = 4200 and r.expense = 70, format('daily totals %s', r);
  select * into r from public.finance_monthly_totals((select v from ids where k = 'h1'), 2026);
  assert r.month = 10 and r.income = 4200 and r.expense = 70, format('monthly totals %s', r);
  select * into r from public.finance_category_totals((select v from ids where k = 'h1'), '2026-10-01', '2026-10-31');
  assert r.category_id = (select v from ids where k = 'food') and r.expense = 70, format('grocery rolls up into food %s', r);
end $$;

-- B joins with the code and sees everything A recorded; B's edit stamps updated_by but keeps created_by.
create temp table code_holder on commit drop as select invite_code from public.finance_households;
grant select on code_holder to authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000b","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.finance_transactions) = 0, 'B sees nothing before joining';
  perform public.finance_join_household('NOT-A-CODE', 'B');
  raise exception 'joined with a bad code';
exception when no_data_found then null;
end $$;
select public.finance_join_household((select lower(invite_code) from code_holder), 'B');
do $$ begin
  assert (select count(*) from public.finance_transactions) = 4, 'B sees the shared transactions';
  assert (select count(*) from public.finance_household_members) = 2, 'B sees both members';
  update public.finance_transactions set note = 'edited by B' where type = 'INCOME';
  assert (select created_by_user_id from public.finance_transactions where type = 'INCOME') = '00000000-0000-4000-a000-00000000000a', 'created_by kept';
  assert (select updated_by_user_id from public.finance_transactions where type = 'INCOME') = '00000000-0000-4000-a000-00000000000b', 'updated_by stamped';
end $$;
-- B cannot promote itself or rename the household (owner only), and cannot rotate the code.
do $$ begin
  update public.finance_household_members set role = 'OWNER' where user_id = '00000000-0000-4000-a000-00000000000b';
  raise exception 'B changed its role';
exception when insufficient_privilege then null;
end $$;
do $$ declare n int; begin
  update public.finance_households set name = 'B rename';
  get diagnostics n = row_count;
  assert n = 0, 'B renamed the household';
end $$;
do $$ begin
  perform public.finance_rotate_invite_code();
  raise exception 'B rotated the code';
exception when insufficient_privilege then null;
end $$;
-- The UI archives; a category or account still referenced by a transaction cannot be deleted (ADR 0025).
do $$ begin
  delete from public.finance_categories where id = (select v from ids where k = 'grocery');
  raise exception 'referenced category deleted';
exception when foreign_key_violation then null;
end $$;
do $$ begin
  delete from public.finance_accounts where id = (select v from ids where k = 'a_acct');
  raise exception 'referenced account deleted';
exception when foreign_key_violation then null;
end $$;
-- Only the owner deletes the household.
do $$ declare n int; begin
  delete from public.finance_households;
  get diagnostics n = row_count;
  assert n = 0, 'member B deleted the household';
end $$;

-- C still sees only H2.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000c","role":"authenticated"}', true);
do $$ declare n int; begin
  assert (select count(*) from public.finance_transactions) = 0, 'C cannot see H1 transactions';
  assert (select count(*) from public.finance_household_members) = 1, 'C sees only its membership';
  delete from public.finance_transactions;
  get diagnostics n = row_count;
  assert n = 0, 'C cannot delete H1 transactions';
end $$;

-- The owner can delete the household; everything in it goes with it.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
do $$ declare n int; begin
  delete from public.finance_households where id = (select v from ids where k = 'h1');
  get diagnostics n = row_count;
  assert n = 1, 'owner deletes the household';
  assert (select count(*) from public.finance_transactions) = 0, 'transactions cascaded';
end $$;

-- anon sees nothing.
reset role;
set local role anon;
do $$ begin
  perform 1 from public.finance_transactions;
  raise exception 'anon read transactions';
exception when insufficient_privilege then null;
end $$;

reset role;
select 'PASS finance' as result;
rollback;
