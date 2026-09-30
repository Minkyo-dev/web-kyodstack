# 0003. Email + password auth, single owner, no public signup
- Status: accepted
- Date: 2026-09-29

## Decision
- Supabase Auth email + password (`signInWithPassword`) through a Server Action.
- No signup UI. Create the owner account in the Supabase dashboard, and disable public signups there.
- The spec's `/auth/callback` route is not needed yet (no OAuth or magic link). Add it if another provider is enabled.
- The dev-mode auth bypass from the old scaffold is removed. Private pages always require a real session.

## Consequences
E2E tests can log in with a test account through the form.
