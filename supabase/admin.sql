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
