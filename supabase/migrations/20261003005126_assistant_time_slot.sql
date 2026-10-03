-- ADR 0044: assistant P5 — coaching proposes a time slot for a rule's block (`slot-v1`).
alter table public.assistant_proposals drop constraint assistant_proposals_kind_check;
alter table public.assistant_proposals add constraint assistant_proposals_kind_check
  check (kind in ('rule_minutes', 'habit_days', 'review', 'create_task', 'time_slot'));
