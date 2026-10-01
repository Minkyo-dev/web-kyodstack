-- G1 fix: a numeric criterion needs a target. `null > 0` is NULL, which a CHECK accepts.
alter table public.mission_criteria drop constraint mission_criteria_check;
alter table public.mission_criteria add constraint mission_criteria_target_check
  check ((kind = 'check' and target_value is null)
      or (kind = 'numeric' and target_value is not null and target_value > 0));
