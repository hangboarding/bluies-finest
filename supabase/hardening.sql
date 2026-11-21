-- =====================================================================
-- Bluies Finest — database hardening (run once in the Supabase SQL editor).
-- Safe to run again. Also included at the end of schema.sql for new projects.
--
-- What it does:
--   • Rejects impossible session values (0s hangs, 10,000 sets, 1mm edges…)
--   • Recomputes points on the server, so they can't be forged from the app
--   • Stamps created_at on the server and stops back-dating or re-owning sessions
--   • Keeps "personal best" flags from being edited after the fact
--   • Only allows avatar URLs that point at this project's own avatar storage
-- Existing rows are left alone (constraints are added NOT VALID).
-- =====================================================================

-- ---------- sanity limits on sessions ----------
do $$
declare
  c record;
begin
  for c in select * from (values
    ('sessions_hang_range',     'hang between 1 and 300'),
    ('sessions_sets_range',     'sets between 1 and 50 and reps between 1 and 30'),
    ('sessions_edge_range',     'edge_mm between 3 and 60'),
    ('sessions_load_range',     'added_kg between 0 and 150 and assist_kg between 0 and 150 and lift_kg between 0 and 200 and effort_pct between 0 and 100'),
    ('sessions_hangs_range',    'total_hangs between 0 and 3000 and full_hangs between 0 and total_hangs'),
    ('sessions_tut_range',      'tut_s >= 0 and tut_s <= 300 * total_hangs + 1'),
    ('sessions_rpe_range',      'rpe is null or rpe between 1 and 10'),
    ('sessions_loadpct_range',  'load_pct is null or load_pct between 10 and 400')
  ) as t(name, expr)
  loop
    if not exists (select 1 from pg_constraint where conname = c.name) then
      execute format('alter table public.sessions add constraint %I check (%s) not valid', c.name, c.expr);
    end if;
  end loop;

  if not exists (select 1 from pg_constraint where conname = 'profiles_avatar_url_ours') then
    alter table public.profiles add constraint profiles_avatar_url_ours check (
      avatar_url is null
      or avatar_url ~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/avatars/[0-9a-f-]+/[A-Za-z0-9._-]+$'
    ) not valid;
  end if;
end $$;

-- ---------- server-side points + tamper protection ----------
create or replace function public.sessions_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  lf double precision;
  ef double precision;
begin
  if tg_op = 'INSERT' then
    new.created_at := now();            -- no back-dating
    new.user_id    := auth.uid();       -- always the signed-in user
  else
    new.created_at := old.created_at;   -- immutable after creation
    new.user_id    := old.user_id;
    new.is_pb      := old.is_pb;        -- PB is decided when the session is saved
  end if;

  -- Same formula as src/lib/scoring.ts sessionPoints()
  lf := case when new.mode = 'lift' then coalesce(nullif(new.effort_pct, 0), 60) / 100.0
             else coalesce(new.load_pct, 100) / 100.0 end;
  lf := least(2, greatest(0.4, lf));
  ef := least(1.6, greatest(0.6, 20.0 / greatest(1, new.edge_mm)));
  new.points := round(5 + new.tut_s * lf * ef / 2 + 2 * new.full_hangs + case when new.is_pb then 20 else 0 end);
  return new;
end $$;

drop trigger if exists sessions_guard on public.sessions;
create trigger sessions_guard
  before insert or update on public.sessions
  for each row execute function public.sessions_guard();
