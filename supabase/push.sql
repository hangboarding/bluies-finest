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
