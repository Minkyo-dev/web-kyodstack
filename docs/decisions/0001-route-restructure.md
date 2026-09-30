# 0001. Restructure routes to the spec and rename portfolio tables
- Status: accepted
- Date: 2026-09-29

## Context
The first scaffold used `/private/*`, `/admin/*` and `/private/login`, and it had a
portfolio `projects` table. The spec (§7, §10) uses `/login`, `/dashboard` and `/scheduler/*`,
and it defines a scheduler `projects` table that would collide with the portfolio table.

## Decision
- Routes follow the spec: `(public)`, `(auth)/login`, `(private)/dashboard` and `(private)/scheduler/*`.
- The portfolio table is renamed `portfolio_projects`, so the scheduler keeps the spec's `projects` name.
- The unused scaffold (admin console, resume, private apps, invite tokens) is removed from routing.
  Public pages remain as-is (mock content).

## Consequences
The scheduler schema matches the spec one-to-one. Portfolio code must use `portfolio_projects`.
