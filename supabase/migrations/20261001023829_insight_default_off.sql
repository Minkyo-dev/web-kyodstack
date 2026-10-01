-- F2: automatic weekly analysis stays off until the user picks a weekday/hour (no surprise AI calls).
update public.scheduler_settings set insight_weekday = null;
