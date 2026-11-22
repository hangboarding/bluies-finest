-- =====================================================================
-- Bluies Finest: second round of hardening (November 2026 review)
-- Run once in Supabase → SQL Editor after the other scripts. Safe to run again.
--
--   • Session totals (hangs, full hangs, time under tension) are worked out from the
--     hang-by-hang log instead of trusting the numbers the app sends
--   • Sessions can only have their editable fields changed (edge, load, RPE, note), and
--     sessions from a finished season can't have their scoring changed at all
--   • Length limits on every session text field and on the hang log
--   • Comments, hearts and problem reports always get the server's time
--   • Limits on how fast comments and problem reports can be sent
--   • Push subscriptions must be a real https push address
--   • A log the notify function uses so un-hearting and re-hearting doesn't re-notify
-- New limits are added NOT VALID, so existing rows are left alone.
-- =====================================================================

-- ---------- session limits ----------
do $$
declare c record;
begin
  for c in select * from (values
    ('sessions_text_len', 'char_length(protocol_key) <= 40 and char_length(protocol_name) <= 80 and char_length(grip) <= 40 and char_length(fingers) <= 40 and char_length(board) <= 60 and char_length(edge_material) <= 40 and char_length(edge_profile) <= 40 and char_length(feel) <= 16'),
    ('sessions_hangs_len', 'jsonb_array_length(hangs) <= 1500'),
    ('sessions_hangs_objects', $c$not jsonb_path_exists(hangs, '$[*] ? (@.type() != "object")')$c$)
  ) as t(name, expr)
  loop
    if not exists (select 1 from pg_constraint where conname = c.name) then
      execute format('alter table public.sessions add constraint %I check (%s) not valid', c.name, c.expr);
    end if;
  end loop;
end $$;

-- ---------- start of the current season (Australia/Sydney): 1 Mar, 1 Jun, 1 Sep or 1 Dec ----------
create or replace function public.current_season_start()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select ((date_trunc('month', now() at time zone 'Australia/Sydney')
           - make_interval(months => (extract(month from now() at time zone 'Australia/Sydney')::int % 3)))
          at time zone 'Australia/Sydney');
$$;

-- ---------- server-side totals, points and tamper protection ----------
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

  -- Same formula as src/lib/scoring.ts sessionPoints()
  lf := case when new.mode = 'lift' then coalesce(nullif(new.effort_pct, 0), 60) / 100.0
             else coalesce(new.load_pct, 100) / 100.0 end;
  lf := least(2, greatest(0.4, lf));
  ef := least(1.6, greatest(0.6, 20.0 / greatest(1, new.edge_mm)));
  -- numeric rounding (halves round up) to match JavaScript's Math.round exactly
  new.points := round((5 + new.tut_s * lf * ef / 2 + 2 * new.full_hangs + case when new.is_pb then 20 else 0 end)::numeric);
  return new;
end $$;

drop trigger if exists sessions_guard on public.sessions;
create trigger sessions_guard
  before insert or update on public.sessions
  for each row execute function public.sessions_guard();

-- Members can only edit what the app's "Edit session" sheet edits (points are recomputed above).
revoke update on public.sessions from authenticated;
grant update (edge_mm, added_kg, assist_kg, lift_kg, rpe, note, load_pct, points) on public.sessions to authenticated;

-- ---------- server time on comments, hearts and reports; rate limits ----------
create or replace function public.stamp_and_limit()
returns trigger
language plpgsql
set search_path = public
as $$
declare n int;
begin
  new.created_at := now();
  if tg_table_name = 'comments' then
    select count(*) into n from public.comments where user_id = auth.uid() and created_at > now() - interval '1 hour';
    if n >= 60 then raise exception 'You''re commenting very fast. Try again in a bit.' using errcode = 'P0001'; end if;
  elsif tg_table_name = 'issues' then
    select count(*) into n from public.issues where user_id = auth.uid() and created_at > now() - interval '1 hour';
    if n >= 5 then raise exception 'You''ve sent a few reports already. Try again in an hour.' using errcode = 'P0001'; end if;
  end if;
  return new;
end $$;

drop trigger if exists comments_stamp on public.comments;
create trigger comments_stamp before insert on public.comments for each row execute function public.stamp_and_limit();
drop trigger if exists likes_stamp on public.likes;
create trigger likes_stamp before insert on public.likes for each row execute function public.stamp_and_limit();
drop trigger if exists issues_stamp on public.issues;
create trigger issues_stamp before insert on public.issues for each row execute function public.stamp_and_limit();

-- ---------- push subscriptions: real https push addresses only ----------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'push_endpoint_ok') then
    alter table public.push_subscriptions add constraint push_endpoint_ok check (
      endpoint ~ '^https://[^/\s]+/' and char_length(endpoint) <= 1024
      and char_length(p256dh) <= 200 and char_length(auth) <= 100
      and (user_agent is null or char_length(user_agent) <= 400)
    ) not valid;
  end if;
end $$;

-- ---------- notification log (used only by the notify function) ----------
-- One row per (kind, session, person), so hearting, un-hearting and hearting again notifies once.
create table if not exists public.notify_log (
  key  text primary key,
  at   timestamptz not null default now()
);
alter table public.notify_log enable row level security;  -- no policies: members can't see or touch it
revoke all on public.notify_log from public, anon, authenticated;
grant select, insert, delete on public.notify_log to service_role;
