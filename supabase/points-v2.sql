-- =====================================================================
-- Bluies Finest: points v2 (November 2026). Run after hardening-2.sql. Safe to run again.
--
-- Heavier load now clearly earns more (intensity is squared), one-arm hangs count double,
-- no-hang lifts score by the weight lifted, and long easy volume has diminishing returns.
-- Matches src/lib/scoring.ts sessionPoints(). Re-scores every existing session at the end.
-- =====================================================================

create or replace function public.sessions_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  li double precision;
  ef double precision;
begin
  if tg_op = 'INSERT' then
    -- Sessions saved offline upload later with their real finish time; accept up to 7 days old,
    -- otherwise (or if in the future) use the server's clock. No long-range back-dating.
    new.created_at := case when new.created_at between now() - interval '7 days' and now() + interval '5 minutes'
                           then new.created_at else now() end;
    new.user_id    := auth.uid();       -- always the signed-in user
  else
    new.created_at := old.created_at;   -- immutable after creation
    new.user_id    := old.user_id;
    new.is_pb      := old.is_pb;        -- PB is decided when the session is saved
    new.hangs      := old.hangs;        -- the hang log can't be rewritten
    -- a finished season's results are final: its sessions can still get a note or RPE, but not new scoring
    if old.created_at < public.current_season_start() then
      new.edge_mm := old.edge_mm; new.added_kg := old.added_kg; new.assist_kg := old.assist_kg;
      new.lift_kg := old.lift_kg; new.load_pct := old.load_pct;
    end if;
  end if;

  -- Totals come from the hang log (each hold counts up to its target), not from the app's numbers.
  -- Same rules as src/views/hang.ts: full = held the whole target.
  if jsonb_array_length(new.hangs) > 0 then
    select count(*)::int,
           count(*) filter (where (h->>'held')::double precision >= (h->>'target')::double precision)::int,
           coalesce(sum(least((h->>'held')::double precision, (h->>'target')::double precision)), 0)
      into new.total_hangs, new.full_hangs, new.tut_s
      from jsonb_array_elements(new.hangs) h;
  else
    new.total_hangs := 0; new.full_hangs := 0; new.tut_s := 0;
  end if;
  if new.full_hangs = 0 then new.is_pb := false; end if; -- no PB without a single full hang

  -- Same formula as src/lib/scoring.ts sessionPoints() (points v2, November 2026):
  -- intensity = load as a fraction of bodyweight on two arms (one-arm counts double; lifts store
  -- per-hand kg × 2 ÷ bodyweight in load_pct), clamped 0.4–3; work = tut × intensity² × edge factor;
  -- points = 5 + 40·ln(1 + work/40) + 10 × share of hangs held full + 10 for a PB.
  li := case when new.mode = 'lift' then coalesce(new.load_pct / 100.0, coalesce(nullif(new.effort_pct, 0), 60) / 100.0)
             else coalesce(new.load_pct, 100) / 100.0 * case when new.hands = 'both' then 1 else 2 end end;
  li := least(3, greatest(0.4, li));
  ef := least(1.6, greatest(0.6, 20.0 / greatest(1, new.edge_mm)));
  -- numeric rounding (halves round up) to match JavaScript's Math.round exactly
  new.points := round((5 + 40 * ln(1 + greatest(0, new.tut_s) * li * li * ef / 40.0)
                       + case when new.total_hangs > 0 then 10.0 * new.full_hangs / new.total_hangs else 0 end
                       + case when new.is_pb then 10 else 0 end)::numeric);
  return new;
end $$;

drop trigger if exists sessions_guard on public.sessions;
create trigger sessions_guard
  before insert or update on public.sessions
  for each row execute function public.sessions_guard();

-- Re-score existing sessions with the new formula (the trigger recomputes points on update;
-- finished seasons keep their inputs, only the points formula changes).
update public.sessions set points = points;
