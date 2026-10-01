-- G1 follow-up: atomic purpose switch and mission save (mission row + identity links in one transaction).
-- Both are security invoker: RLS scopes every statement to the caller.

create or replace function public.set_purpose(p_statement text)
returns public.purposes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_new public.purposes;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  update public.purposes set status = 'archived' where user_id = v_user and status = 'active';
  insert into public.purposes (user_id, statement) values (v_user, trim(p_statement)) returning * into v_new;
  return v_new;
end $$;

-- p_mission_id null creates (linked to the active purpose); otherwise updates. closed_at follows the status:
-- set when it leaves 'active' or changes between closed states, kept while unchanged, cleared when reopened.
create or replace function public.save_mission(
  p_mission_id uuid,
  p_title text,
  p_outcome text,
  p_deadline date,
  p_status text,
  p_identity_ids uuid[]
)
returns public.missions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_old public.missions;
  v_row public.missions;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_mission_id is null then
    insert into public.missions (user_id, purpose_id, title, outcome, deadline)
    values (
      v_user,
      (select id from public.purposes where user_id = v_user and status = 'active'),
      trim(p_title),
      nullif(trim(coalesce(p_outcome, '')), ''),
      p_deadline
    )
    returning * into v_row;
  else
    select * into v_old from public.missions where id = p_mission_id and user_id = v_user for update;
    if v_old.id is null then
      raise exception 'mission not found' using errcode = 'P0002';
    end if;
    update public.missions set
      title = trim(p_title),
      outcome = nullif(trim(coalesce(p_outcome, '')), ''),
      deadline = p_deadline,
      status = p_status,
      closed_at = case
        when p_status = 'active' then null
        when v_old.status = p_status then v_old.closed_at
        else now()
      end
    where id = p_mission_id
    returning * into v_row;
    delete from public.mission_identities where mission_id = v_row.id and user_id = v_user;
  end if;

  -- Composite FK (identity_id, user_id) rejects another user's identity and rolls the whole save back.
  insert into public.mission_identities (user_id, mission_id, identity_id)
  select distinct v_user, v_row.id, i from unnest(coalesce(p_identity_ids, '{}')) as i;
  return v_row;
end $$;

revoke all on function public.set_purpose(text) from public, anon;
revoke all on function public.save_mission(uuid, text, text, date, text, uuid[]) from public, anon;
grant execute on function public.set_purpose(text) to authenticated;
grant execute on function public.save_mission(uuid, text, text, date, text, uuid[]) to authenticated;
