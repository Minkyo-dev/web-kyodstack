-- ADR 0025: the UI only archives accounts and categories, but an unused one may be deleted (E2E cleanup; the
-- foreign keys from transactions and subcategories reject deleting anything still referenced). The owner may delete
-- the whole household, which cascades to its members and data.

create policy finance_accounts_delete_member on public.finance_accounts
  for delete to authenticated using ((select private.finance_is_member(household_id)));
create policy finance_categories_delete_member on public.finance_categories
  for delete to authenticated using ((select private.finance_is_member(household_id)));
create policy finance_households_delete_owner on public.finance_households
  for delete to authenticated using ((select private.finance_is_owner(id)));

grant delete on public.finance_accounts, public.finance_categories, public.finance_households to authenticated;
