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
