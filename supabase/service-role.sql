-- =====================================================================
-- Bluies Finest — let server functions read the tables (run once).
-- Safe to run again. Also included at the end of schema.sql.
--
-- The `notify` Edge Function uses Supabase's built-in `service_role` to look
-- up sessions, names and push subscriptions. Newer Supabase projects don't
-- grant that role access to new tables automatically, which shows up in the
-- function logs as "permission denied for table sessions".
-- service_role is only ever used on the server; the app never has its key.
-- =====================================================================

grant usage on schema public to service_role;
grant select on public.sessions, public.profiles to service_role;
grant select, delete on public.push_subscriptions to service_role;
