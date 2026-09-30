# 0004. Atomic schedule mutations via Postgres functions
- Status: accepted
- Date: 2026-09-29

## Context
Spec §56 requires that the block update and its revision insert succeed or fail together.
supabase-js has no client-side transactions.

## Decision
Postgres functions (`security invoker`, so RLS still applies) do each multi-write mutation:
`create_schedule_block`, `move_schedule_block` (also used for resize), and later `accept_ai_recommendation`.
TypeScript services validate the input and call them with `.rpc()`.

## Consequences
Business rules stay in TypeScript. The functions only guarantee atomicity and write the revision rows.
