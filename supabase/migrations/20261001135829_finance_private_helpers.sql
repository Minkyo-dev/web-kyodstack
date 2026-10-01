-- Security advisor (0029): keep SECURITY DEFINER finance functions out of the exposed API schema.
-- The definer bodies move to the unexposed `private` schema; the API keeps invoker wrappers for the three
-- household RPCs, and the membership helpers used by RLS are no longer callable over REST.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

alter function public.finance_is_member(uuid) set schema private;
alter function public.finance_is_owner(uuid) set schema private;
alter function public.finance_create_household(text, text) set schema private;
alter function public.finance_join_household(text, text) set schema private;
alter function public.finance_rotate_invite_code() set schema private;

-- Policies follow the function by OID, so they already call private.finance_is_member/owner.

create or replace function public.finance_create_household(p_name text, p_display_name text)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.finance_create_household(p_name, p_display_name) $$;

create or replace function public.finance_join_household(p_code text, p_display_name text)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.finance_join_household(p_code, p_display_name) $$;

create or replace function public.finance_rotate_invite_code()
returns text
language sql
security invoker
set search_path = ''
as $$ select private.finance_rotate_invite_code() $$;

revoke execute on function public.finance_create_household(text, text), public.finance_join_household(text, text),
  public.finance_rotate_invite_code() from public, anon;
grant execute on function public.finance_create_household(text, text), public.finance_join_household(text, text),
  public.finance_rotate_invite_code() to authenticated;
