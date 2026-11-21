-- =====================================================================
-- Bluies Finest - Supabase schema
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- It is safe to run again later (it updates things in place).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  avatar_url  text,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Owner-only data. Bodyweight lives here and nowhere else.
create table if not exists public.private_data (
  id             uuid primary key references public.profiles (id) on delete cascade,
  bodyweight_kg  numeric check (bodyweight_kg is null or (bodyweight_kg > 0 and bodyweight_kg < 500)),
  settings       jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object')
);

create table if not exists public.sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at     timestamptz not null default now(),
  protocol_key   text not null default '',
  protocol_name  text not null default '',
  mode           text not null default 'hang' check (mode in ('hang', 'lift')),
  hang           double precision not null default 0,
  rest           double precision not null default 0,
  sets           integer not null default 0,
  reps           integer not null default 0,
  set_rest       double precision not null default 0,
  edge_mm        double precision not null default 0,
  added_kg       double precision not null default 0,
  assist_kg      double precision not null default 0,
  lift_kg        double precision not null default 0,
  effort_pct     double precision not null default 0,
  hands          text not null default 'both' check (hands in ('both', 'L', 'R', 'LR')),
  grip           text not null default '',
  fingers        text not null default '',
  board          text not null default '',
  edge_material  text not null default '',
  edge_profile   text not null default '',
  feel           text not null default '',
  rpe            double precision,
  tut_s          double precision not null default 0,
  full_hangs     integer not null default 0,
  total_hangs    integer not null default 0,
  hangs          jsonb not null default '[]'::jsonb check (jsonb_typeof(hangs) = 'array'),
  load_pct       double precision,
  points         double precision not null default 0,
  is_pb          boolean not null default false,
  note           text not null default '' check (char_length(note) <= 2000)
);

create table if not exists public.likes (
  session_id  uuid not null references public.sessions (id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (session_id, user_id)
);

create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions (id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at  timestamptz not null default now()
);

create table if not exists public.invite_codes (
  code        text primary key,
  max_uses    integer check (max_uses is null or max_uses >= 0),
  uses        integer not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------

create index if not exists sessions_user_created_idx on public.sessions (user_id, created_at desc);
create index if not exists sessions_created_idx      on public.sessions (created_at desc);
create index if not exists likes_session_idx         on public.likes (session_id);
create index if not exists likes_user_idx            on public.likes (user_id);
create index if not exists comments_session_idx      on public.comments (session_id, created_at);
create index if not exists comments_user_idx         on public.comments (user_id);

-- ---------------------------------------------------------------------
-- Helper: is the current user an admin? (security definer = no RLS recursion)
-- ---------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------
-- Invite-gated signup: runs when a new auth user is created.
-- ---------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(btrim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));
  v_name text := btrim(coalesce(new.raw_user_meta_data ->> 'name', ''));
  v_hit  text;
begin
  -- Atomically consume one use of the code (no race between check and increment).
  update public.invite_codes
     set uses = uses + 1
   where code = v_code
     and (max_uses is null or uses < max_uses)
  returning code into v_hit;

  if v_hit is null then
    raise exception 'INVALID_INVITE_CODE' using errcode = 'P0001';
  end if;

  if v_name = '' then
    v_name := split_part(coalesce(new.email, 'Climber'), '@', 1);
  end if;
  v_name := left(v_name, 40);

  insert into public.profiles (id, name) values (new.id, v_name)
  on conflict (id) do nothing;

  insert into public.private_data (id) values (new.id)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Lets the signup form check a code before creating the account.
-- Returns only true/false; never exposes the codes themselves.
create or replace function public.check_invite_code(p_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.invite_codes
     where code = upper(btrim(coalesce(p_code, '')))
       and (max_uses is null or uses < max_uses)
  );
$$;

revoke all on function public.check_invite_code(text) from public;
grant execute on function public.check_invite_code(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Stop users from making themselves admin (or changing id / created_at).
-- Changes made from the SQL editor (role "postgres") are allowed.
-- ---------------------------------------------------------------------

create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.is_admin is distinct from old.is_admin then
      raise exception 'You cannot change admin status';
    end if;
    if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
      raise exception 'You cannot change that field';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_columns on public.profiles;
create trigger protect_profile_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- ---------------------------------------------------------------------
-- Delete my account (cascades to everything I own).
-- The app removes avatar files via the Storage API before calling this.
-- ---------------------------------------------------------------------

create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;

-- ---------------------------------------------------------------------
-- Privileges (RLS below does the row-level filtering)
-- ---------------------------------------------------------------------

revoke all on public.profiles, public.private_data, public.sessions,
              public.likes, public.comments, public.invite_codes from anon;
revoke all on public.invite_codes from authenticated;

-- Profiles: clients may only ever update name and avatar_url.
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (name, avatar_url) on public.profiles to authenticated;

grant select, insert, update on public.private_data to authenticated;
grant select, insert, update, delete on public.sessions to authenticated;
grant select, insert, delete on public.likes to authenticated;
grant select, insert, delete on public.comments to authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

alter table public.profiles     enable row level security;
alter table public.private_data enable row level security;
alter table public.sessions     enable row level security;
alter table public.likes        enable row level security;
alter table public.comments     enable row level security;
alter table public.invite_codes enable row level security;  -- no policies = no client access

-- profiles
drop policy if exists "profiles: members read" on public.profiles;
create policy "profiles: members read" on public.profiles
  for select to authenticated using (true);

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- private_data (owner only, never shared)
drop policy if exists "private: read own" on public.private_data;
create policy "private: read own" on public.private_data
  for select to authenticated using (id = (select auth.uid()));

drop policy if exists "private: insert own" on public.private_data;
create policy "private: insert own" on public.private_data
  for insert to authenticated with check (id = (select auth.uid()));

drop policy if exists "private: update own" on public.private_data;
create policy "private: update own" on public.private_data
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- sessions
drop policy if exists "sessions: members read" on public.sessions;
create policy "sessions: members read" on public.sessions
  for select to authenticated using (true);

drop policy if exists "sessions: insert own" on public.sessions;
create policy "sessions: insert own" on public.sessions
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "sessions: update own" on public.sessions;
create policy "sessions: update own" on public.sessions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "sessions: delete own or admin" on public.sessions;
create policy "sessions: delete own or admin" on public.sessions
  for delete to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- likes
drop policy if exists "likes: members read" on public.likes;
create policy "likes: members read" on public.likes
  for select to authenticated using (true);

drop policy if exists "likes: insert own" on public.likes;
create policy "likes: insert own" on public.likes
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "likes: delete own" on public.likes;
create policy "likes: delete own" on public.likes
  for delete to authenticated using (user_id = (select auth.uid()));

-- comments
drop policy if exists "comments: members read" on public.comments;
create policy "comments: members read" on public.comments
  for select to authenticated using (true);

drop policy if exists "comments: insert own" on public.comments;
create policy "comments: insert own" on public.comments
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "comments: delete own or admin" on public.comments;
create policy "comments: delete own or admin" on public.comments
  for delete to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- ---------------------------------------------------------------------
-- Storage: public "avatars" bucket, each user writes only to "<uid>/..."
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars: read own folder" on storage.objects;
create policy "avatars: read own folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "avatars: upload own folder" on storage.objects;
create policy "avatars: upload own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "avatars: update own folder" on storage.objects;
create policy "avatars: update own folder" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "avatars: delete own folder" on storage.objects;
create policy "avatars: delete own folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------
-- Seed: the starting invite code (unlimited uses). See docs/SUPABASE.md.
-- ---------------------------------------------------------------------

-- Only seeds when there are no codes yet, so re-running this file never brings back
-- an old code after you've changed it.
insert into public.invite_codes (code, max_uses)
select 'BLUIES', null
where not exists (select 1 from public.invite_codes);

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
    ('sessions_loadpct_range',  'load_pct is null or load_pct between 10 and 400'),
    ('sessions_tut_cap',        'tut_s <= 7200 and total_hangs <= 1500'),
    ('sessions_hangs_shape',    $c$not jsonb_path_exists(hangs, '$[*] ? (@.held.type() != "number" || @.held < 0 || @.held > 300 || @.target.type() != "number")')$c$)
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
    -- Sessions saved offline upload later with their real finish time; accept up to 7 days old,
    -- otherwise (or if in the future) use the server's clock. No long-range back-dating.
    new.created_at := case when new.created_at between now() - interval '7 days' and now() + interval '5 minutes'
                           then new.created_at else now() end;
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
  -- numeric rounding (halves round up) to match JavaScript's Math.round exactly
  new.points := round((5 + new.tut_s * lf * ef / 2 + 2 * new.full_hangs + case when new.is_pb then 20 else 0 end)::numeric);
  return new;
end $$;

drop trigger if exists sessions_guard on public.sessions;
create trigger sessions_guard
  before insert or update on public.sessions
  for each row execute function public.sessions_guard();

-- =====================================================================
-- Bluies Finest — admin page access (run once in the Supabase SQL editor).
-- Safe to run again. Also included at the end of schema.sql for new projects.
--
-- Lets admins (profiles.is_admin = true) view, add, edit and delete invite
-- codes from the app's Admin page. Everyone else still can't see them.
-- =====================================================================

-- Sign-up compares codes in UPPERCASE, so make sure every stored code is uppercase
-- (a code saved as 'MyCode' would otherwise never match anything).
update public.invite_codes set code = upper(btrim(code)) where code <> upper(btrim(code));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invite_codes_code_format') then
    alter table public.invite_codes add constraint invite_codes_code_format
      check (code ~ '^[A-Z0-9_-]{3,40}$') not valid;
  end if;
end $$;

grant select, insert, update, delete on public.invite_codes to authenticated;

drop policy if exists "invite codes: admins read" on public.invite_codes;
create policy "invite codes: admins read" on public.invite_codes
  for select to authenticated using ((select public.is_admin()));

drop policy if exists "invite codes: admins insert" on public.invite_codes;
create policy "invite codes: admins insert" on public.invite_codes
  for insert to authenticated with check ((select public.is_admin()));

drop policy if exists "invite codes: admins update" on public.invite_codes;
create policy "invite codes: admins update" on public.invite_codes
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "invite codes: admins delete" on public.invite_codes;
create policy "invite codes: admins delete" on public.invite_codes
  for delete to authenticated using ((select public.is_admin()));

-- =====================================================================
-- Bluies Finest — seasons and crew challenges (run once in the SQL editor).
-- Safe to run again. Also included at the end of schema.sql for new projects.
-- =====================================================================

-- ---------- Seasons ----------
-- Southern-hemisphere seasons in Blue Mountains time: Summer Dec–Feb, Autumn Mar–May,
-- Winter Jun–Aug, Spring Sep–Nov. Must match src/lib/seasons.ts.
create or replace function public.season_start_of(ts timestamptz)
returns date
language sql
immutable
set search_path = ''
as $$
  select case
    when extract(month from ts at time zone 'Australia/Sydney') in (1, 2)
      then make_date(extract(year from ts at time zone 'Australia/Sydney')::int - 1, 12, 1)
    else make_date(extract(year from ts at time zone 'Australia/Sydney')::int,
                   (extract(month from ts at time zone 'Australia/Sydney')::int
                    - (extract(month from ts at time zone 'Australia/Sydney')::int % 3)), 1)
  end;
$$;

-- Winner(s) of every finished season — the climber(s) with the most points. Ties share the title.
create or replace function public.season_champions()
returns table (season_start date, user_id uuid, points double precision)
language sql
stable
security invoker
set search_path = ''
as $$
  with totals as (
    select public.season_start_of(s.created_at) as season_start, s.user_id, sum(s.points) as pts
    from public.sessions s
    where public.season_start_of(s.created_at) < public.season_start_of(now())
    group by 1, 2
  ), ranked as (
    select t.*, rank() over (partition by t.season_start order by t.pts desc) as r from totals t
  )
  select r.season_start, r.user_id, r.pts from ranked r where r.r = 1 order by r.season_start desc;
$$;

revoke all on function public.season_champions() from public, anon;
grant execute on function public.season_champions() to authenticated;

-- ---------- Crew challenges ----------
create table if not exists public.challenges (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 80),
  metric      text not null check (metric in ('hangs', 'sessions', 'minutes', 'pbs', 'climbers')),
  target      integer not null check (target between 1 and 100000),
  starts_on   date not null,
  ends_on     date not null,
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  check (ends_on >= starts_on and ends_on - starts_on <= 92)
);
create index if not exists challenges_dates_idx on public.challenges (starts_on, ends_on);

alter table public.challenges enable row level security;
grant select on public.challenges to authenticated;
grant insert, update, delete on public.challenges to authenticated;

drop policy if exists "challenges: members read" on public.challenges;
create policy "challenges: members read" on public.challenges
  for select to authenticated using (true);

drop policy if exists "challenges: admins insert" on public.challenges;
create policy "challenges: admins insert" on public.challenges
  for insert to authenticated with check ((select public.is_admin()));

drop policy if exists "challenges: admins update" on public.challenges;
create policy "challenges: admins update" on public.challenges
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "challenges: admins delete" on public.challenges;
create policy "challenges: admins delete" on public.challenges
  for delete to authenticated using ((select public.is_admin()));

-- =====================================================================
-- Bluies Finest: phone push notifications (Web Push subscriptions)
-- Run once in Supabase → SQL Editor after schema.sql. Safe to run again.
-- See docs/PUSH.md for the full setup.
-- =====================================================================

-- One row per device/browser that has turned notifications on.
-- The endpoint is the push service URL for that device and is unique.
create table if not exists public.push_subscriptions (
  endpoint    text primary key,
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz default now()
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Only signed-in members, and only their own rows. The notify Edge Function
-- uses the service role key, which bypasses these rules.
revoke all on public.push_subscriptions from public, anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

drop policy if exists "push: read own" on public.push_subscriptions;
create policy "push: read own" on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "push: insert own" on public.push_subscriptions;
create policy "push: insert own" on public.push_subscriptions
  for insert to authenticated with check (user_id = (select auth.uid()));

-- Upserts (insert ... on conflict (endpoint) do update) hit this policy on a
-- conflict. Because USING only matches your own rows, an upsert onto someone
-- else's endpoint fails instead of taking it over; the app then makes a fresh
-- subscription with a new endpoint.
drop policy if exists "push: update own" on public.push_subscriptions;
create policy "push: update own" on public.push_subscriptions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "push: delete own" on public.push_subscriptions;
create policy "push: delete own" on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));
