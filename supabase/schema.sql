-- =====================================================================
-- Bluies Finest - Supabase schema
-- Everything the app needs, in one file. Paste it all into Supabase -> SQL Editor ->
-- New query -> Run. For a new project, and to update an existing one: it's safe to run
-- again (it updates things in place and never deletes your data).
--
-- Sections, in order: tables, security and policies, avatars, invite codes, hardening,
-- admin page access, seasons and crew challenges, push notifications, server-function
-- access, problem reports, profile location, hardening 2, fair scoring (points v3),
-- fuller Edit session and top-3 alerts, session names, and crew settings (the admin's bird pick).
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
-- Bluies Finest — database hardening (part of schema.sql, safe to run again).
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
-- Bluies Finest — admin page access (part of schema.sql, safe to run again).
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
-- Bluies Finest — seasons and crew challenges (part of schema.sql, safe to run again).
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
-- Part of schema.sql (safe to run again).
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

-- =====================================================================
-- Bluies Finest — let server functions read the tables (part of schema.sql, safe to run again).
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


-- =====================================================================
-- Bluies Finest: "Report an issue" (problem reports from members to admins)
-- Part of schema.sql (safe to run again).
-- To get a phone notification and an email for each new report, also follow
-- the "Problem reports" section of docs/PUSH.md.
-- =====================================================================

create table if not exists public.issues (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  category    text not null default 'bug' check (category in ('bug', 'idea', 'account', 'other')),
  body        text not null check (char_length(btrim(body)) between 1 and 2000),
  context     text check (char_length(context) <= 500),   -- device/browser and app page, filled in by the app
  status      text not null default 'open' check (status in ('open', 'resolved')),
  created_at  timestamptz not null default now()
);

create index if not exists issues_created_at_idx on public.issues (created_at desc);
create index if not exists issues_user_id_idx on public.issues (user_id);

alter table public.issues enable row level security;

revoke all on public.issues from public, anon;
grant select, insert, update, delete on public.issues to authenticated;

-- Members send reports as themselves, and can see their own.
drop policy if exists "issues: insert own" on public.issues;
create policy "issues: insert own" on public.issues
  for insert to authenticated with check (user_id = (select auth.uid()) and status = 'open');

drop policy if exists "issues: read own or admin" on public.issues;
create policy "issues: read own or admin" on public.issues
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));

-- Only admins mark reports resolved or delete them.
drop policy if exists "issues: admins update" on public.issues;
create policy "issues: admins update" on public.issues
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "issues: admins delete" on public.issues;
create policy "issues: admins delete" on public.issues
  for delete to authenticated using ((select public.is_admin()));


-- =====================================================================
-- Bluies Finest: optional public location on profiles
-- Part of schema.sql (safe to run again).
--
-- A member's location stays private (in private_data) unless they tick
-- "Show on my profile"; only then does the app copy it here, where other
-- members can see it under their photo.
-- =====================================================================

alter table public.profiles add column if not exists location text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_location_len') then
    alter table public.profiles add constraint profiles_location_len
      check (location is null or char_length(location) between 1 and 60);
  end if;
end $$;

-- Members can change their own name, photo and shown location (the existing
-- "profiles: update own" policy limits it to their own row).
grant update (name, avatar_url, location) on public.profiles to authenticated;


-- =====================================================================
-- Bluies Finest: second round of hardening (November 2026 review). Part of schema.sql.
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


-- =====================================================================
-- Bluies Finest: points v3, fair scoring (November 2026). Part of schema.sql (safe to run again).
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
-- Abrahangs and Warm-up are light by design (feet on or assisted, rarely entered as assist), so
-- they count at most 0.6. Same rules as src/lib/scoring.ts intensity().
drop function if exists public.session_work(text, text, double precision, double precision, double precision, double precision, double precision, double precision);
create or replace function public.session_work(p_protocol text, p_mode text, p_hands text, p_load_pct double precision,
  p_added double precision, p_assist double precision, p_lift double precision, p_tut double precision, p_edge double precision)
returns double precision
language sql immutable
set search_path = public
as $$
  select greatest(0, p_tut)
       * case when p_hands = 'both' then 1 else 0.5 end
       * power(least(case when p_protocol in ('abra', 'warm') then 0.6 else 3 end, greatest(case when p_mode = 'lift' then 0.1 else 0.4 end, -- a lift counts only what it lifts
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
      new.lift_kg := old.lift_kg; new.mode := old.mode;
    end if;
    -- switching between a hang and a no-hang lift changes the load as much as a new weight does
    reload := new.added_kg is distinct from old.added_kg or new.assist_kg is distinct from old.assist_kg
           or new.lift_kg is distinct from old.lift_kg or new.mode is distinct from old.mode;
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
  select coalesce(sum(public.session_work(c.protocol_key, c.mode, c.hands, c.load_pct, c.added_kg, c.assist_kg, c.lift_kg, c.tut_s, c.edge_mm)), 0),
         coalesce(bool_or(c.tut_s >= 15), false),
         coalesce(bool_or(c.is_pb), false)
    into w0, had_real, had_pb
    from public.sessions c
   where c.user_id = new.user_id and c.id <> new.id
     and c.created_at >= day0
     and (c.created_at, c.id) < (new.created_at, new.id);
  w := public.session_work(new.protocol_key, new.mode, new.hands, new.load_pct, new.added_kg, new.assist_kg, new.lift_kg, new.tut_s, new.edge_mm);
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
  for each row when (old.load_pct is distinct from new.load_pct or old.edge_mm is distinct from new.edge_mm or old.mode is distinct from new.mode)
  execute function public.sessions_rescore_day();

-- (This season is re-scored at the end of the latest points section, "points v4" below.)


-- =====================================================================
-- Bluies Finest: fuller "Edit session", and top-3 alerts (November 2026). Part of schema.sql, safe to run again.
--
--   • Edit session can also change how a session was done: grip, fingers, board, edge material and
--     profile, pre-session feel, and a no-hang lift's target effort. None of these change points.
--     It can also switch a session between a hang and a no-hang lift (one logged the wrong way): the
--     load and points are worked out again, as for a new weight. The timings and the hang-by-hang
--     log still can't be changed.
--   • No-hang lifts score only the weight lifted: the 40% floor that hangs have no longer applies to them
--     (it's in session_work, above; running this file re-scores the current season with it).
--   • rank_alerts: "Sam took your #2 spot" notices. The notify function writes one when a new session
--     knocks someone down from the top 3 of the Overall board; they show in the app's bell. For phone
--     notifications too, add the sessions webhook in docs/PUSH.md ("Top-3 alerts").
-- =====================================================================

grant update (edge_mm, added_kg, assist_kg, lift_kg, rpe, note, load_pct, points, mode,
              grip, fingers, board, edge_material, edge_profile, feel, effort_pct) on public.sessions to authenticated;

create table if not exists public.rank_alerts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,  -- who lost their place
  by_user_id  uuid not null references public.profiles (id) on delete cascade,  -- whose session did it
  session_id  uuid references public.sessions (id) on delete cascade,
  old_place   integer not null check (old_place between 1 and 3),
  new_place   integer not null check (new_place > old_place),
  created_at  timestamptz not null default now()
);
create index if not exists rank_alerts_user_idx on public.rank_alerts (user_id, created_at desc);

alter table public.rank_alerts enable row level security;
-- members can only read their own; only the notify function (service_role) writes them
revoke all on public.rank_alerts from public, anon, authenticated;
grant select on public.rank_alerts to authenticated;
grant select, insert, delete on public.rank_alerts to service_role;

drop policy if exists "rank_alerts: read own" on public.rank_alerts;
create policy "rank_alerts: read own" on public.rank_alerts
  for select to authenticated using (user_id = (select auth.uid()));


-- =====================================================================
-- Bluies Finest: session names (November 2026). Part of schema.sql, safe to run again.
--
--   • A session can have its own name ("Birthday hang"), given on the summary when it's saved or later
--     in Edit session. Empty means it goes by its protocol's name. protocol_name is kept as it was, so
--     stats like "Favourite protocol" still know what it was. A name never changes points, so sessions
--     from a finished season can be renamed too.
--   • Renaming one of your own protocols renames it on the sessions you've logged with it (protocol_name),
--     so everyone sees the new name. Points come from protocol_key, never the name.
-- =====================================================================

alter table public.sessions add column if not exists title text not null default '';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sessions_title_len') then
    alter table public.sessions add constraint sessions_title_len check (char_length(title) <= 60);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sessions_protocol_name_len') then
    alter table public.sessions add constraint sessions_protocol_name_len check (char_length(protocol_name) <= 80) not valid;
  end if;
end $$;
grant update (title, protocol_name) on public.sessions to authenticated;


-- =====================================================================
-- Bluies Finest: crew settings (November 2026). Part of schema.sql, safe to run again.
--
--   • Small settings the whole crew shares and only admins change, one row per key. For now there's one:
--     "bird", the bird an admin has picked on the admin page (a species id such as "galah"). Everyone's
--     bird page shows it every week in place of the weekly rotation, until an admin sets it back to
--     Automatic, which removes the row.
-- =====================================================================

create table if not exists public.app_settings (
  key         text primary key check (char_length(key) between 1 and 40),
  value       jsonb not null,
  updated_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);

alter table public.app_settings enable row level security;
grant select on public.app_settings to authenticated;
grant insert, update, delete on public.app_settings to authenticated;

drop policy if exists "app settings: members read" on public.app_settings;
create policy "app settings: members read" on public.app_settings
  for select to authenticated using (true);

drop policy if exists "app settings: admins insert" on public.app_settings;
create policy "app settings: admins insert" on public.app_settings
  for insert to authenticated with check ((select public.is_admin()));

drop policy if exists "app settings: admins update" on public.app_settings;
create policy "app settings: admins update" on public.app_settings
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "app settings: admins delete" on public.app_settings;
create policy "app settings: admins delete" on public.app_settings
  for delete to authenticated using ((select public.is_admin()));


-- =====================================================================
-- Bluies Finest: points v4, every set scores (November 2026). Part of schema.sql, safe to run again.
--
-- Matches src/lib/scoring.ts. Why: one heavy set could earn what a whole session did (load was squared
-- and a day's volume was squashed hard). What changed:
--   • Every set in the hang log scores: 10 × time × the share of the set done (no bonus for finishing).
--     Time = the set's full length (planned reps × hang time, or more if more was logged) ÷ 10, in full
--     up to 10s, then √ (a 7s × 6 repeater set ≈ 2). Share = seconds held ÷ that length, so one rep of
--     a six-rep set earns a sixth of it. A one-arm hang's time counts half per arm, so left + right
--     together count like one two-arm hang.
--   • A session's raw points = its set points × load × edge × hold. Load counts in proportion now
--     (it was squared): +100% doubles a set's points. A no-hang lift's load is the weight in each hand
--     ÷ half the climber's bodyweight. Abrahangs and Warm-up count at most 40%.
--   • Hold = grip × fingers × one-arm, together at most ×2: full crimp ×1.3, half crimp, pinch and
--     sloper ×1.2, open hand and drag ×1.05; three fingers ×1.15, two ×1.3, mono ×1.5; a one-arm hang
--     (not a lift) ×1.5.
--   • Per day (Sydney time) the first 200 raw points count in full, then 200 + 75·ln(1 + rest/75).
--     Each session still earns what it adds to its day; the 5 for showing up and the PB 10 are as before.
--   • Training regularly: points × 1.1 when there were real sessions (15s+) on 2 or more of the 7 days before.
--   • Load, edge, grip, fingers and hang-or-lift lock 24 hours after a session (and stay locked once
--     its season is over). Grip and fingers now change points, so changing them re-scores.
--   • Adding or removing a session re-scores the climber's later sessions that day and the 7 days after
--     (the regular-training bonus looks back a week).
-- At the end, every session in the current season is re-scored. Finished seasons are untouched.
-- =====================================================================

-- Points from the sets in a hang log, before load, edge and hold. Same rules as src/lib/scoring.ts setPoints().
-- The log has only the hangs that were done, so a set's full length comes from the planned reps × hang time.
drop function if exists public.set_points(text, jsonb);
create or replace function public.set_points(p_hands text, p_reps double precision, p_hang double precision, p_hangs jsonb)
returns double precision
language sql immutable
set search_path = public
as $$
  select coalesce(sum(case when x.f > 0 then 10 * case when x.f <= 10 then x.f / 10 else sqrt(x.f / 10) end * x.h / x.f else 0 end), 0)
    from (select sum(greatest(0, least((h->>'held')::double precision, (h->>'target')::double precision)))
                   * case when p_hands = 'both' then 1 else 0.5 end as h,
                 greatest(sum(greatest(0, (h->>'target')::double precision)) * case when p_hands = 'both' then 1 else 0.5 end,
                          coalesce(p_reps, 0) * coalesce(p_hang, 0) * case when p_hands = 'LR' then 2 else 1 end
                            * case when p_hands = 'both' then 1 else 0.5 end) as f
            from jsonb_array_elements(p_hangs) h
           group by h->'set') x;
$$;

-- Raw points for one session: set points × load × edge × hold. Same rules as src/lib/scoring.ts sessionWork().
drop function if exists public.session_work(text, text, text, double precision, double precision, double precision, double precision, double precision, double precision);
drop function if exists public.session_work(text, text, text, double precision, double precision, double precision, double precision, double precision, text, text, jsonb);
create or replace function public.session_work(p_protocol text, p_mode text, p_hands text, p_load_pct double precision,
  p_added double precision, p_assist double precision, p_lift double precision, p_edge double precision,
  p_grip text, p_fingers text, p_reps double precision, p_hang double precision, p_hangs jsonb)
returns double precision
language sql immutable
set search_path = public
as $$
  select public.set_points(p_hands, p_reps, p_hang, p_hangs)
       -- load: two-arm-equivalent ÷ bodyweight (one-arm hang ×2; lifts are per hand × 2 ÷ bw), in proportion
       * least(case when p_protocol in ('abra', 'warm') then 0.4 else 3 end, greatest(case when p_mode = 'lift' then 0.1 else 0.4 end,
           coalesce(p_load_pct,
             least(400, greatest(10, round((case when p_mode = 'lift' then 2 * p_lift / 70.0 * 100
                                                 else (70 + p_added - p_assist) / 70.0 * 100 end)::numeric)))::double precision)
           / 100.0 * case when p_mode = 'hang' and p_hands <> 'both' then 2 else 1 end))
       -- edge
       * least(1.6, greatest(0.6, 20.0 / greatest(1, p_edge)))
       -- hold: grip × fingers × one-arm hang, at most ×2
       * least(2, (case p_grip when 'Full crimp' then 1.3 when 'Half crimp' then 1.2 when 'Pinch' then 1.2 when 'Sloper' then 1.2
                               when 'Open' then 1.05 when 'Drag' then 1.05 else 1 end)::double precision
                * (case p_fingers when 'Front 3' then 1.15 when 'Back 3' then 1.15 when 'Front 2' then 1.3 when 'Middle 2' then 1.3
                                  when 'Back 2' then 1.3 when 'Mono' then 1.5 else 1 end)::double precision
                * case when p_mode = 'hang' and p_hands <> 'both' then 1.5 else 1 end);
$$;

-- A day's points from its raw points: the first 200 in full, then with diminishing returns.
create or replace function public.day_points(w double precision)
returns double precision
language sql immutable
set search_path = public
as $$
  select case when w <= 200 then w else 200 + 75 * ln(1 + (w - 200) / 75.0) end;
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
  regular  boolean;
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
    -- What scores can be fixed for 24 hours, then it's final (and a finished season's always is).
    -- Its name, note, RPE, board and the like can still be changed.
    if old.created_at < now() - interval '24 hours' or old.created_at < public.current_season_start() then
      new.edge_mm := old.edge_mm; new.added_kg := old.added_kg; new.assist_kg := old.assist_kg;
      new.lift_kg := old.lift_kg; new.mode := old.mode; new.grip := old.grip; new.fingers := old.fingers;
    end if;
    -- switching between a hang and a no-hang lift changes the load as much as a new weight does
    reload := new.added_kg is distinct from old.added_kg or new.assist_kg is distinct from old.assist_kg
           or new.lift_kg is distinct from old.lift_kg or new.mode is distinct from old.mode;
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

  -- Points: what this session adds to the climber's day, with diminishing returns past 200 a day.
  day0 := public.scoring_day_start(new.created_at);
  select coalesce(sum(public.session_work(c.protocol_key, c.mode, c.hands, c.load_pct, c.added_kg, c.assist_kg, c.lift_kg,
                                          c.edge_mm, c.grip, c.fingers, c.reps, c.hang, c.hangs)), 0),
         coalesce(bool_or(c.tut_s >= 15), false),
         coalesce(bool_or(c.is_pb), false)
    into w0, had_real, had_pb
    from public.sessions c
   where c.user_id = new.user_id and c.id <> new.id
     and c.created_at >= day0
     and (c.created_at, c.id) < (new.created_at, new.id);
  -- Training regularly: real sessions on 2 or more different days of the 7 before this one's.
  select count(distinct public.scoring_day_start(c.created_at)) >= 2
    into regular
    from public.sessions c
   where c.user_id = new.user_id and c.id <> new.id and c.tut_s >= 15
     and c.created_at >= ((day0 at time zone 'Australia/Sydney') - interval '7 days') at time zone 'Australia/Sydney'
     and c.created_at < day0;
  w := public.session_work(new.protocol_key, new.mode, new.hands, new.load_pct, new.added_kg, new.assist_kg, new.lift_kg,
                           new.edge_mm, new.grip, new.fingers, new.reps, new.hang, new.hangs);
  -- numeric rounding (halves round up) to match JavaScript's Math.round
  new.points := round((
      case when new.tut_s >= 15 and not had_real then 5 else 0 end
    + (public.day_points(w0 + w) - public.day_points(w0)) * case when regular then 1.1::double precision else 1 end
    + case when new.is_pb and not had_pb then 10 else 0 end)::numeric);

  -- a finished season's points are final
  if tg_op = 'UPDATE' and old.created_at < public.current_season_start() then new.points := old.points; end if;
  return new;
end $$;

drop trigger if exists sessions_guard on public.sessions;
create trigger sessions_guard
  before insert or update on public.sessions
  for each row execute function public.sessions_guard();

-- When a session is added, edited or deleted, re-score the climber's later sessions that day (each one's
-- points depend on the work done earlier that day) and in the 7 days after (the regular-training bonus).
-- Runs as the owner so an admin removing someone's session re-scores theirs too.
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
     and s.created_at < ((day0 at time zone 'Australia/Sydney') + interval '8 days') at time zone 'Australia/Sydney'
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
  for each row when (old.load_pct is distinct from new.load_pct or old.edge_mm is distinct from new.edge_mm or old.mode is distinct from new.mode
                     or old.grip is distinct from new.grip or old.fingers is distinct from new.fingers)
  execute function public.sessions_rescore_day();

-- Re-score this season with the new rules (each session's points depend only on the other sessions'
-- weights, times and hang logs, never their points, so the order rows are updated in doesn't matter).
update public.sessions set points = points where created_at >= public.current_season_start();
