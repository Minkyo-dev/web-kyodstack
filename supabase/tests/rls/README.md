# RLS tests

Plain SQL. Each file runs inside `begin … rollback`, so nothing persists on the remote DB.
Every assertion is a `DO` block that raises an exception on failure, and a passing run
ends with a `select 'PASS …'` row.

Run with the Supabase MCP `execute_sql` (paste the file), or:

```
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls/scheduler_core.sql
```

Add a file per feature (for example `projects.sql` in Phase 4). Each file must cover:
A reads A; A cannot read/update/delete B; A cannot insert rows owned by B;
cross-user parent references are rejected; anon sees nothing.
