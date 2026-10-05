-- ADR 0046 V6: XP rule 'vocab' — a local day with ≥ 10 flashcard reviews earns +20 once (capped in code).
alter table public.xp_events drop constraint xp_events_rule_check;
alter table public.xp_events add constraint xp_events_rule_check
  check (rule in ('focus', 'completion', 'commitment', 'quest', 'habit', 'vocab'));
