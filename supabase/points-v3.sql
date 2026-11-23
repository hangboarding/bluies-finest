-- =====================================================================
-- Bluies Finest: points v3, fair scoring (November 2026). Run after points-v2.sql.
-- Safe to run again. Replaces season-lock.sql (its rule is built in here).
--
-- Matches src/lib/scoring.ts. What changed:
--   • Points are scored per day (Sydney time). Each session earns the work points it adds to
--     its day, so lots of little sessions never beat one real one. The 5 for showing up is
--     once a day (for a session with 15s+ under tension) and the PB bonus is once a day.
--   • Holding every hang full time is worth up to 25% more on the session's work points,
--     instead of a flat 10 that could be collected over and over.
--   • One-arm hangs count each arm's time at half, so left + right at bodyweight equals a
--     two-arm hang at +100% (the same load on each arm); one hand only is half of that.
--   • Load comes from the kg entered and the climber's own bodyweight, worked out here, never
--     from the app's number. With no bodyweight set, 70kg is assumed for points. Target
--     effort % no longer counts at all.
--   • Personal bests are checked here against the climber's earlier sessions.
--   • A finished season's points are frozen, and nothing new can be dated into it.
--   • When a session is added, edited or deleted, the climber's later sessions that day are
--     re-scored automatically.
-- At the end, every session in the current season is re-scored. Finished seasons are untouched.
-- =====================================================================

-- Start of the scoring day (midnight Sydney time) containing ts.
create or replace function public.scoring_day_start(ts timestamptz)
returns timestamptz
language sql stable
set search_path = public
as $$
  select date_trunc('day', ts at time zone 'Australia/Sydney') at time zone 'Australia/Sydney';
$$;

-- Training work in one session: tut × intensity² × edge factor, one-arm time at half.
-- Intensity = two-arm-equivalent load ÷ bodyweight (one-arm hang ×2; lifts are per hand × 2 ÷ bw),
-- clamped 0.4–3. With no load_pct (no bodyweight set), a 70kg climber is assumed.
create or replace function public.session_work(p_mode text, p_hands text, p_load_pct double precision,
  p_added double precision, p_assist double precision, p_lift double precision, p_tut double precision, p_edge double precision)
returns double precision
language sql immutable
set search_path = public
as $$
  select greatest(0, p_tut)
       * case when p_hands = 'both' then 1 else 0.5 end
       * power(least(3, greatest(0.4,
           coalesce(p_load_pct,
             least(400, greatest(10, round((case when p_mode = 'lift' then 2 * p_lift / 70.0 * 100
                                                 else (70 + p_added - p_assist) / 70.0 * 100 end)::numeric)))::double precision)
           / 100.0 * case when p_mode = 'hang' and p_hands <> 'both' then 2 else 1 end)), 2)
       * least(1.6, greatest(0.6, 20.0 / greatest(1, p_edge)));
$$;

create or replace function public.sessions_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  bw       double precision;
  day0     timestamptz;
  w0       double precision;
  w        double precision;
  had_real boolean;
  had_pb   boolean;
  held     double precision;
  reload   boolean;
begin
  if tg_op = 'INSERT' then
    -- Sessions saved offline upload later with their real finish time; accept up to 7 days old,
    -- otherwise (or if in the future) use the server's clock. No long-range back-dating.
    new.created_at := case when new.created_at between now() - interval '7 days' and now() + interval '5 minutes'
                           then new.created_at else now() end;
    -- A finished season's results are final: nothing new can be dated into it.
    if new.created_at < public.current_season_start() then new.created_at := now(); end if;
    new.user_id := auth.uid();          -- always the signed-in user
    reload := true;
  else
    new.created_at := old.created_at;   -- immutable after creation
    new.user_id    := old.user_id;
    new.is_pb      := old.is_pb;        -- PB is decided when the session is saved
    new.hangs      := old.hangs;        -- the hang log can't be rewritten
    -- a finished season's results are final: its sessions can still get a note or RPE, but not new scoring
    if old.created_at < public.current_season_start() then
      new.edge_mm := old.edge_mm; new.added_kg := old.added_kg; new.assist_kg := old.assist_kg;
      new.lift_kg := old.lift_kg;
    end if;
    reload := new.added_kg is distinct from old.added_kg or new.assist_kg is distinct from old.assist_kg
           or new.lift_kg is distinct from old.lift_kg;
  end if;

  -- Load always comes from the kg entered and the climber's own bodyweight, never the app's number.
  -- (Edits only recompute it when the weights change, using today's bodyweight.)
  if reload then
    select pd.bodyweight_kg into bw from public.private_data pd where pd.id = new.user_id;
    new.load_pct := case when bw is null or bw <= 0 then null
                         when new.mode = 'lift' then least(400, greatest(10, round((2 * new.lift_kg / bw * 100)::numeric)))
                         else least(400, greatest(10, round(((bw + new.added_kg - new.assist_kg) / bw * 100)::numeric))) end;
  else
    new.load_pct := old.load_pct;
  end if;

  -- Totals come from the hang log (each hold counts up to its target), not from the app's numbers.
  if jsonb_array_length(new.hangs) > 0 then
    select count(*)::int,
           count(*) filter (where (h->>'held')::double precision >= (h->>'target')::double precision)::int,
           coalesce(sum(least((h->>'held')::double precision, (h->>'target')::double precision)), 0)
      into new.total_hangs, new.full_hangs, new.tut_s
      from jsonb_array_elements(new.hangs) h;
  else
    new.total_hangs := 0; new.full_hangs := 0; new.tut_s := 0;
  end if;

  -- Personal best, checked against the climber's earlier sessions (same rules as src/views/hang.ts):
  -- heavier than every comparable session (same mode, edge, one/two-arm, hang length within 3s),
  -- or a smaller edge than ever before at the same load or more.
  if tg_op = 'INSERT' then
    new.is_pb := new.full_hangs > 0 and (
      (exists (select 1 from public.sessions c
                where c.user_id = new.user_id and c.mode = new.mode and c.edge_mm = new.edge_mm and c.full_hangs > 0
                  and (c.hands = 'both') = (new.hands = 'both') and abs(c.hang - new.hang) <= 3
                  and (new.mode = 'lift' or c.load_pct is not null))
       and case when new.mode = 'lift' then
             not exists (select 1 from public.sessions c
                          where c.user_id = new.user_id and c.mode = 'lift' and c.edge_mm = new.edge_mm and c.full_hangs > 0
                            and (c.hands = 'both') = (new.hands = 'both') and abs(c.hang - new.hang) <= 3
                            and c.lift_kg >= new.lift_kg)
           else
             new.load_pct is not null
             and not exists (select 1 from public.sessions c
                              where c.user_id = new.user_id and c.mode = 'hang' and c.edge_mm = new.edge_mm and c.full_hangs > 0
                                and (c.hands = 'both') = (new.hands = 'both') and abs(c.hang - new.hang) <= 3
                                and c.load_pct is not null and c.load_pct >= new.load_pct)
           end)
      or
      (new.mode = 'hang' and new.load_pct is not null
       and exists (select 1 from public.sessions c
                    where c.user_id = new.user_id and c.mode = 'hang' and c.full_hangs > 0 and c.load_pct is not null
                      and (c.hands = 'both') = (new.hands = 'both') and abs(c.hang - new.hang) <= 3
                      and c.edge_mm > new.edge_mm)
       and not exists (select 1 from public.sessions c
                        where c.user_id = new.user_id and c.mode = 'hang' and c.full_hangs > 0 and c.load_pct is not null
                          and (c.hands = 'both') = (new.hands = 'both') and abs(c.hang - new.hang) <= 3
                          and c.load_pct >= new.load_pct and c.edge_mm <= new.edge_mm))
    );
  end if;
  if new.full_hangs = 0 then new.is_pb := false; end if; -- no PB without a single full hang

  -- Points: the work this session adds to the climber's day, with diminishing returns per day.
  day0 := public.scoring_day_start(new.created_at);
  select coalesce(sum(public.session_work(c.mode, c.hands, c.load_pct, c.added_kg, c.assist_kg, c.lift_kg, c.tut_s, c.edge_mm)), 0),
         coalesce(bool_or(c.tut_s >= 15), false),
         coalesce(bool_or(c.is_pb), false)
    into w0, had_real, had_pb
    from public.sessions c
   where c.user_id = new.user_id and c.id <> new.id
     and c.created_at >= day0
     and (c.created_at, c.id) < (new.created_at, new.id);
  w := public.session_work(new.mode, new.hands, new.load_pct, new.added_kg, new.assist_kg, new.lift_kg, new.tut_s, new.edge_mm);
  held := case when new.total_hangs > 0 then new.full_hangs::double precision / new.total_hangs else 0 end;
  -- numeric rounding (halves round up) to match JavaScript's Math.round
  new.points := round((
      case when new.tut_s >= 15 and not had_real then 5 else 0 end
    + (40 * ln(1 + (w0 + w) / 40.0) - 40 * ln(1 + w0 / 40.0)) * (1 + 0.25 * held)
    + case when new.is_pb and not had_pb then 10 else 0 end)::numeric);

  -- a finished season's points are final
  if tg_op = 'UPDATE' and old.created_at < public.current_season_start() then new.points := old.points; end if;
  return new;
end $$;

drop trigger if exists sessions_guard on public.sessions;
create trigger sessions_guard
  before insert or update on public.sessions
  for each row execute function public.sessions_guard();

-- The season lock is now inside sessions_guard (it has to run before points are worked out).
drop trigger if exists sessions_season_lock on public.sessions;
drop function if exists public.sessions_season_lock();

-- When a session is added, edited or deleted, re-score the climber's later sessions that day
-- (each session's points depend on the work done earlier that day). Runs as the owner so an
-- admin removing someone's session re-scores theirs too.
create or replace function public.sessions_rescore_day()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r    record;
  day0 timestamptz;
begin
  if pg_trigger_depth() > 1 then return null; end if; -- the re-score itself doesn't cascade
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  day0 := public.scoring_day_start(r.created_at);
  update public.sessions s set points = s.points
   where s.user_id = r.user_id
     and s.created_at >= greatest(day0, public.current_season_start())
     and s.created_at < day0 + interval '26 hours'
     and public.scoring_day_start(s.created_at) = day0
     and (s.created_at, s.id) > (r.created_at, r.id);
  return null;
end $$;

drop trigger if exists sessions_rescore_ins on public.sessions;
create trigger sessions_rescore_ins after insert on public.sessions
  for each row execute function public.sessions_rescore_day();
drop trigger if exists sessions_rescore_del on public.sessions;
create trigger sessions_rescore_del after delete on public.sessions
  for each row execute function public.sessions_rescore_day();
drop trigger if exists sessions_rescore_upd on public.sessions;
create trigger sessions_rescore_upd after update on public.sessions
  for each row when (old.load_pct is distinct from new.load_pct or old.edge_mm is distinct from new.edge_mm)
  execute function public.sessions_rescore_day();

-- Re-score this season with the new rules (each session's points depend only on the other
-- sessions' weights and times, so the order rows are updated in doesn't matter).
update public.sessions set points = points where created_at >= public.current_season_start();
