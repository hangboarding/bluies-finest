-- =====================================================================
-- Bluies Finest: "Report an issue" (problem reports from members to admins)
-- Run once in Supabase → SQL Editor after schema.sql. Safe to run again.
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
