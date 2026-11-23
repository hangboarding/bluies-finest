// @vitest-environment node
// Runs the whole supabase/schema.sql (twice) in PGlite (real Postgres, in-process) with stand-ins
// for Supabase's own auth/storage schemas and roles, then signs up and saves sessions through it
// and checks the database's points match the app's src/lib/scoring.ts.
import { test, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import schemaSql from '../supabase/schema.sql?raw';
import { sessionPoints } from '../src/lib/scoring';

const SCHEMA = schemaSql.replace('create extension if not exists pgcrypto;', '-- (pgcrypto: gen_random_uuid is built in)');

const SUPABASE_STANDINS = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select 'authenticated' $$;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
`;

const U = '11111111-1111-1111-1111-111111111111';

test('schema.sql runs on a fresh database, runs again cleanly, and scores like the app', async () => {
  const db = new PGlite();
  await db.exec(SUPABASE_STANDINS);
  await db.exec(SCHEMA);
  await db.exec(SCHEMA); // safe to run again

  // sign-up trigger: profile + private row created from auth.users
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'a@example.test', '{"name":"Ava","invite":"BLUIES","invite_code":"BLUIES","code":"BLUIES"}')`, [U]);
  const prof = (await db.query<any>(`select name from public.profiles where id = $1`, [U])).rows;
  expect(prof[0]?.name).toBe('Ava');
  await db.query(`update public.private_data set bodyweight_kg = 70 where id = $1`, [U]);

  // the invite code was seeded once, not twice
  expect((await db.query<any>(`select count(*)::int n from public.invite_codes`)).rows[0].n).toBe(1);

  await db.exec(`set test.uid = '${U}'`);
  const hangs = (n: number, t: number, held = t) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ set: i + 1, rep: 1, hand: 'both', target: t, held, full: held >= t })));
  const at = (h: number) => new Date(Date.now() - h * 3600e3).toISOString();
  await db.query(`insert into public.sessions (created_at, mode, hands, hang, rest, sets, reps, set_rest, effort_pct, edge_mm, added_kg, hangs, load_pct, is_pb, points) values ($1,'hang','both',10,180,5,1,180,60,20,0,$2,400,true,9999)`, [at(2), hangs(5, 10)]);
  await db.query(`insert into public.sessions (created_at, mode, hands, hang, rest, sets, reps, set_rest, effort_pct, edge_mm, added_kg, hangs, load_pct, points) values ($1,'hang','both',10,180,3,1,180,60,20,14,$2,400,9999)`, [at(1), hangs(3, 10)]);
  // Abrahangs at bodyweight: counted at most 60%, same as the app
  await db.query(`insert into public.sessions (created_at, protocol_key, mode, hands, hang, rest, sets, reps, set_rest, effort_pct, edge_mm, hangs, points) values ($1,'abra','hang','both',10,20,10,1,180,60,20,$2,9999)`, [at(0.5), hangs(10, 10)]);

  const rows = (await db.query<any>(`select * from public.sessions order by created_at`)).rows;
  const xs = rows.map(r => ({ id: r.id, userId: r.user_id, createdAt: new Date(r.created_at).toISOString(), mode: r.mode, hands: r.hands, hang: r.hang,
    protocolKey: r.protocol_key, edgeMm: r.edge_mm, addedKg: r.added_kg, assistKg: r.assist_kg, liftKg: r.lift_kg, tutS: r.tut_s, fullHangs: r.full_hangs, totalHangs: r.total_hangs,
    loadPct: r.load_pct, isPb: r.is_pb, points: r.points }));
  expect(xs.map(x => x.loadPct)).toEqual([100, 120, 100]); // worked out on the server, not the 400 sent
  expect(xs[0]!.isPb).toBe(false);                      // nothing to beat yet
  for (const x of xs) expect(x.points).toBe(sessionPoints(x as any, xs as any));

  // the policies and triggers from every section exist
  const trig = (await db.query<any>(`select tgname from pg_trigger where tgrelid = 'public.sessions'::regclass and not tgisinternal order by 1`)).rows.map(r => r.tgname);
  expect(trig).toEqual(['sessions_guard', 'sessions_rescore_del', 'sessions_rescore_ins', 'sessions_rescore_upd']);
  for (const t of ['issues', 'push_subscriptions', 'challenges', 'invite_codes', 'notify_log'])
    expect((await db.query<any>(`select to_regclass('public.' || $1) is not null ok`, [t])).rows[0].ok, t).toBe(true);
  expect((await db.query<any>(`select count(*)::int n from information_schema.columns where table_name = 'profiles' and column_name = 'location'`)).rows[0].n).toBe(1);
}, 60000);
