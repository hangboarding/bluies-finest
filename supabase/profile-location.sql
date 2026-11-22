-- =====================================================================
-- Bluies Finest: optional public location on profiles
-- Run once in Supabase → SQL Editor after schema.sql. Safe to run again.
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
