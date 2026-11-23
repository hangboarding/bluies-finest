-- =====================================================================
-- Bluies Finest: season lock (November 2026). Run after hardening-2.sql. Safe to run again.
--
-- A finished season's results are final. New sessions can already be dated up to 7 days back
-- (so ones saved offline upload with their real time), but that let a session land in a
-- season that had already ended and change who won it. Now any new session dated before the
-- current season started is stamped with the server's time instead, so it counts toward
-- this season and can't touch the last one.
--
-- This is its own trigger so it doesn't need to repeat sessions_guard. Postgres runs
-- triggers of the same kind in name order, so it runs after sessions_guard has applied
-- the 7-day rule.
-- =====================================================================

create or replace function public.sessions_season_lock()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.created_at < public.current_season_start() then
    new.created_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists sessions_season_lock on public.sessions;
create trigger sessions_season_lock
  before insert on public.sessions
  for each row execute function public.sessions_season_lock();
