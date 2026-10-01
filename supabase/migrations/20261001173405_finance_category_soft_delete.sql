-- ADR 0027: categories can be logically deleted. A deleted category leaves settings, pickers and filters for good,
-- but the row stays so past transactions keep their category (and the foreign key holds). Deleted implies archived.

alter table public.finance_categories
  add column deleted_at timestamptz,
  add constraint finance_categories_deleted_is_inactive check (deleted_at is null or is_active = false);

-- A deleted category is never brought back or changed (name, parent, order, active flag); only household cascade
-- deletes may remove the row.
create or replace function public.finance_categories_guard_deleted()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.deleted_at is not null then
    raise exception 'category is deleted' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger finance_categories_guard_deleted before update on public.finance_categories
  for each row execute function public.finance_categories_guard_deleted();
