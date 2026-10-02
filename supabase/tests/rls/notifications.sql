-- ADR 0043: devices, preferences and the send log are own-only; users can't write the log; the cron tick is a
-- no-op without Vault secrets.
begin;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-a000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated');
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('00000000-0000-4000-a000-00000000000b', 'https://push.example/b', 'k', 'a');
insert into public.notification_log (user_id, kind, dedupe_key, local_date, title) values ('00000000-0000-4000-a000-00000000000b', 'checkin', 'checkin:2026-10-02', '2026-10-02', 'B');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
do $$ declare n int; begin
  assert (select count(*) from public.push_subscriptions) = 0, 'A cannot read B devices';
  assert (select count(*) from public.notification_log) = 0, 'A cannot read B log';
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('00000000-0000-4000-a000-00000000000a', 'https://push.example/a', 'k', 'a');
  begin
    update public.push_subscriptions set endpoint = 'https://evil';
    assert false, 'subscriptions have no update';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('00000000-0000-4000-a000-00000000000a', 'https://push.example/b', 'k', 'a');
    assert false, 'endpoint unique across users';
  exception when unique_violation then null; end;
  begin
    insert into public.notification_log (user_id, kind, dedupe_key, local_date, title) values ('00000000-0000-4000-a000-00000000000a', 'checkin', 'k', '2026-10-02', 't');
    assert false, 'users cannot write the log';
  exception when insufficient_privilege then null; end;
  insert into public.notification_prefs (user_id, daily_cap) values ('00000000-0000-4000-a000-00000000000a', 3);
  update public.notification_prefs set quiet_start = 21;
  assert (select quiet_start from public.notification_prefs) = 21, 'own prefs update';
  begin
    update public.notification_prefs set daily_cap = 50;
    assert false, 'cap check';
  exception when check_violation then null; end;
  begin
    insert into public.notification_prefs (user_id) values ('00000000-0000-4000-a000-00000000000b');
    assert false, 'A cannot write B prefs';
  exception when insufficient_privilege then null; end;
  delete from public.push_subscriptions;
  get diagnostics n = row_count;
  assert n = 1, 'A deletes only own devices';
end $$;
select set_config('request.jwt.claims', '{"sub":"","role":"anon"}', true);
set local role anon;
do $$ begin
  begin perform count(*) from public.push_subscriptions; assert false, 'anon devices'; exception when insufficient_privilege then null; end;
  begin perform count(*) from public.notification_log; assert false, 'anon log'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin perform private.notify_tick(); end $$;
select 'PASS notifications';
rollback;
