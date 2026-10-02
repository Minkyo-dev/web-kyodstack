-- Advisor 0014: keep pg_net out of the public schema (it is not relocatable, so drop and recreate).
drop extension if exists pg_net;
create extension pg_net schema extensions;
