-- Own delete exists only so E2E cleanup can remove a seeded analysis (same stance as xp_events, ADR 0016).
create policy system_insights_delete_own on public.system_insights for delete to authenticated using (user_id = (select auth.uid()));
grant delete on public.system_insights to authenticated;
