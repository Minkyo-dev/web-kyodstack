-- Contract step for sub-project A: work results now live only in work_logs.
alter table public.work_sessions
  drop column focus_score,
  drop column mood_score,
  drop column energy_score,
  drop column note;
