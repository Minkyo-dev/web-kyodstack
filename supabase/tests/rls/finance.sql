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

-- ADR 0027: C cannot soft-delete an H1 category; a member can, and a deleted category is frozen.
do $$ declare n int; begin
  update public.finance_categories set is_active = false, deleted_at = now() where id = (select v from ids where k = 'grocery');
  get diagnostics n = row_count;
  assert n = 0, 'C cannot soft-delete H1 categories';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
do $$ begin
  begin
    update public.finance_categories set deleted_at = now() where id = (select v from ids where k = 'grocery');
    raise exception 'deleted category left active';
  exception when check_violation then null;
  end;
  update public.finance_categories set is_active = false, deleted_at = now() where id = (select v from ids where k = 'grocery');
  assert (select deleted_at is not null from public.finance_categories where id = (select v from ids where k = 'grocery')),
    'member soft-deletes a category';
  assert (select count(*) from public.finance_transactions where category_id = (select v from ids where k = 'grocery')) > 0,
    'transactions keep the deleted category';
  begin
    update public.finance_categories set is_active = true, deleted_at = null where id = (select v from ids where k = 'grocery');
    raise exception 'deleted category restored';
  exception when check_violation then null;
  end;
end $$;

-- ADR 0029: subscriptions. A member adds a plan; charging records each due date once (idempotent); C cannot see,
-- add to or charge H1; a plan needs an expense category; deleting it keeps its charges.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
with x as (
  insert into public.finance_subscriptions (household_id, name, amount, billing_day, start_date, account_id, category_id)
  values ((select v from ids where k = 'h1'), 'Netflix', 17.99, 1, current_date - 70,
          (select v from ids where k = 'a_acct'), (select v from ids where k = 'food'))
  returning id)
insert into ids select 'sub', id from x;
do $$ declare n int; m int; begin
  begin
    insert into public.finance_subscriptions (household_id, name, amount, billing_day, start_date, account_id, category_id)
    values ((select v from ids where k = 'h1'), 'bad', 1, 1, current_date,
            (select v from ids where k = 'a_acct'), (select v from ids where k = 'salary'));
    raise exception 'income category accepted';
  exception when check_violation then null;
  end;
  n := public.finance_charge_subscriptions((select v from ids where k = 'h1'));
  assert n >= 2, 'past due dates charged';
  assert (select count(*) from public.finance_transactions where subscription_id = (select v from ids where k = 'sub')
          and source = 'SUBSCRIPTION' and type = 'EXPENSE' and extract(day from transaction_date) = 1) = n,
    'charges are expenses on the billing day';
  assert (select charged_through is not null from public.finance_subscriptions where id = (select v from ids where k = 'sub')),
    'charged_through advanced';
  m := public.finance_charge_subscriptions((select v from ids where k = 'h1'));
  assert m = 0, 'charging again records nothing';
  -- The creator and household never change.
  update public.finance_subscriptions set created_by_user_id = '00000000-0000-4000-a000-00000000000b',
    household_id = (select v from ids where k = 'h2') where id = (select v from ids where k = 'sub');
  assert (select created_by_user_id = '00000000-0000-4000-a000-00000000000a' and household_id = (select v from ids where k = 'h1')
          from public.finance_subscriptions where id = (select v from ids where k = 'sub')), 'owner columns kept';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000c","role":"authenticated"}', true);
do $$ declare n int; begin
  assert (select count(*) from public.finance_subscriptions) = 0, 'C cannot see H1 subscriptions';
  begin
    perform public.finance_charge_subscriptions((select v from ids where k = 'h1'));
    raise exception 'C charged H1';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.finance_subscriptions (household_id, name, amount, billing_day, start_date, account_id, category_id)
    values ((select v from ids where k = 'h1'), 'x', 1, 1, current_date, (select v from ids where k = 'c_acct'), (select v from ids where k = 'c_cat'));
    raise exception 'C inserted into H1';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.finance_subscriptions (household_id, name, amount, billing_day, start_date, account_id, category_id)
    values ((select v from ids where k = 'h2'), 'x', 1, 1, current_date, (select v from ids where k = 'a_acct'), (select v from ids where k = 'c_cat'));
    raise exception 'C used an H1 account';
  exception when foreign_key_violation then null;
  end;
  delete from public.finance_subscriptions where id = (select v from ids where k = 'sub');
  get diagnostics n = row_count;
  assert n = 0, 'C deleted an H1 subscription';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000b","role":"authenticated"}', true);
do $$ declare n int; begin
  delete from public.finance_subscriptions where id = (select v from ids where k = 'sub');
  get diagnostics n = row_count;
  assert n = 1, 'member B deletes the plan';
  assert (select count(*) from public.finance_transactions where source = 'SUBSCRIPTION' and subscription_id is null) >= 2,
    'charges stay, unlinked';
end $$;

-- ADR 0032: balances. Joint has income 4200 and a transfer out of 1000 on 2026-10-05; A card has the expense 100,
-- refund 30 and the transfer in on that day. Reconciling records the difference as an adjustment once, which stays
-- out of cash flow; C and future dates are rejected.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
do $$ declare r record; d numeric; begin
  select * into r from public.finance_daily_balances((select v from ids where k = 'h1'), '2026-10-04', '2026-10-06')
    where account_id = (select v from ids where k = 'joint') and day = '2026-10-05';
  assert r.balance = 3200 and r.inflow = 4200 and r.outflow = 1000 and r.adjustment = 0, format('joint day %s', r);
  select * into r from public.finance_daily_balances((select v from ids where k = 'h1'), '2026-10-04', '2026-10-06')
    where account_id = (select v from ids where k = 'a_acct') and day = '2026-10-05';
  assert r.inflow = 1030 and r.outflow = 100, format('card day %s', r);
  assert (select count(*) from public.finance_daily_balances((select v from ids where k = 'h1'), '2026-10-04', '2026-10-06')
          where account_id = (select v from ids where k = 'joint')) = 3, 'one row per day';

  assert (select balance from public.finance_account_balances((select v from ids where k = 'h1'), current_date)
          where account_id = (select v from ids where k = 'joint')) = 0, 'joint is 0 today';
  d := public.finance_reconcile_account((select v from ids where k = 'joint'), current_date, 500);
  assert d = 500, format('reconcile diff %s', d);
  d := public.finance_reconcile_account((select v from ids where k = 'joint'), current_date, 500);
  assert d = 0, 'second reconcile writes nothing';
  assert (select count(*) from public.finance_transactions where account_id = (select v from ids where k = 'joint')
          and type = 'ADJUSTMENT' and source = 'SYSTEM' and amount = 500) = 1, 'one adjustment';
  select * into r from public.finance_account_balances((select v from ids where k = 'h1'), '2026-10-05')
    where account_id = (select v from ids where k = 'joint');
  assert r.balance = 3700 and r.reconciled_on = current_date, format('joint after reconcile %s', r);
  assert (select coalesce(sum(income), 0) from public.finance_daily_totals((select v from ids where k = 'h1'), current_date, current_date)) = 0,
    'adjustment stays out of cash flow';
  begin
    perform public.finance_reconcile_account((select v from ids where k = 'joint'), current_date + 30, 1);
    raise exception 'future reconcile allowed';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.finance_reconcile_account((select v from ids where k = 'c_acct'), current_date, 1);
    raise exception 'A reconciled a C account';
  exception when no_data_found then null;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000c","role":"authenticated"}', true);
do $$ begin
  begin
    perform public.finance_account_balances((select v from ids where k = 'h1'), current_date);
    raise exception 'C read H1 balances';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.finance_daily_balances((select v from ids where k = 'h1'), current_date, current_date);
    raise exception 'C read H1 daily balances';
  exception when insufficient_privilege then null;
  end;
end $$;

-- The owner can delete the household; everything in it goes with it.
-- ADR 0033: budgets. A DEFAULT applies from its month until a later DEFAULT; a MONTH row overrides one month; a null
-- amount means no budget. Only top-level, non-deleted expense categories; another household is denied.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
insert into ids select 'other', id from public.finance_categories
  where household_id = (select v from ids where k = 'h1') and type = 'EXPENSE' and parent_id is null
    and id <> (select v from ids where k = 'food') and deleted_at is null
  order by sort_order limit 1;
insert into public.finance_budgets (household_id, category_id, month, kind, amount) values
  ((select v from ids where k = 'h1'), (select v from ids where k = 'food'), '2026-01-01', 'DEFAULT', 800),
  ((select v from ids where k = 'h1'), (select v from ids where k = 'food'), '2026-03-01', 'MONTH', 1000),
  ((select v from ids where k = 'h1'), (select v from ids where k = 'food'), '2026-05-01', 'DEFAULT', 900),
  ((select v from ids where k = 'h1'), (select v from ids where k = 'other'), '2026-02-01', 'DEFAULT', 100),
  ((select v from ids where k = 'h1'), (select v from ids where k = 'other'), '2026-04-01', 'DEFAULT', null);
do $$ declare r record; h uuid := (select v from ids where k = 'h1'); f uuid := (select v from ids where k = 'food');
  o uuid := (select v from ids where k = 'other'); begin
  assert (select amount from public.finance_month_budgets(h, '2026-01-15') where category_id = f) = 800, 'jan default';
  assert (select count(*) from public.finance_month_budgets(h, '2026-01-01') where category_id = o) = 0, 'other not yet';
  assert (select amount from public.finance_month_budgets(h, '2026-02-01') where category_id = o) = 100, 'feb other';
  select * into r from public.finance_month_budgets(h, '2026-03-01') where category_id = f;
  assert r.amount = 1000 and r.is_override and r.default_amount = 800, format('mar override %s', r);
  select * into r from public.finance_month_budgets(h, '2026-04-01') where category_id = f;
  assert r.amount = 800 and not r.is_override, format('apr back to default %s', r);
  assert (select count(*) from public.finance_month_budgets(h, '2026-04-01') where category_id = o) = 0, 'other removed';
  assert (select amount from public.finance_month_budgets(h, '2026-06-01') where category_id = f) = 900, 'new default';
  assert (select amount from public.finance_month_budgets(h, '2026-01-01') where category_id = f) = 800, 'past keeps old';
  begin
    insert into public.finance_budgets (household_id, category_id, month, kind, amount)
    values (h, (select v from ids where k = 'grocery'), '2026-01-01', 'DEFAULT', 1);
    raise exception 'subcategory budget accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.finance_budgets (household_id, category_id, month, kind, amount)
    values (h, (select v from ids where k = 'salary'), '2026-01-01', 'DEFAULT', 1);
    raise exception 'income budget accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.finance_budgets (household_id, category_id, month, kind, amount) values (h, f, '2026-01-02', 'MONTH', 1);
    raise exception 'mid-month budget accepted';
  exception when check_violation then null;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000c","role":"authenticated"}', true);
do $$ declare n int; begin
  assert (select count(*) from public.finance_budgets) = 0, 'C cannot see H1 budgets';
  begin
    perform public.finance_month_budgets((select v from ids where k = 'h1'), '2026-01-01');
    raise exception 'C read H1 budgets';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.finance_budgets (household_id, category_id, month, kind, amount)
    values ((select v from ids where k = 'h1'), (select v from ids where k = 'food'), '2026-07-01', 'DEFAULT', 1);
    raise exception 'C wrote an H1 budget';
  -- The category trigger runs before RLS and cannot see H1's category, so either error is a rejection.
  exception when insufficient_privilege or check_violation then null;
  end;
  update public.finance_budgets set amount = 1;
  get diagnostics n = row_count;
  assert n = 0, 'C updated H1 budgets';
end $$;

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
