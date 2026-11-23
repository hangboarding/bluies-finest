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

  // Edit session: how it was done can be changed, the timer's numbers can't
  const can = async (role: string, col: string) => (await db.query<any>(`select has_column_privilege($1, 'public.sessions', $2, 'UPDATE') ok`, [role, col])).rows[0].ok;
  for (const c of ['grip', 'fingers', 'board', 'edge_material', 'edge_profile', 'feel', 'effort_pct', 'edge_mm', 'added_kg', 'rpe', 'note']) expect(await can('authenticated', c), c).toBe(true);
  for (const c of ['hang', 'rest', 'sets', 'hangs', 'tut_s', 'created_at', 'user_id', 'hands', 'protocol_key', 'is_pb']) expect(await can('authenticated', c), c).toBe(false);

  // top-3 alerts: members read their own, only the notify function writes them
  const priv = async (role: string, what: string) => (await db.query<any>(`select has_table_privilege($1, 'public.rank_alerts', $2) ok`, [role, what])).rows[0].ok;
  expect([await priv('authenticated', 'SELECT'), await priv('authenticated', 'INSERT'), await priv('anon', 'SELECT')]).toEqual([true, false, false]);
  expect([await priv('service_role', 'SELECT'), await priv('service_role', 'INSERT')]).toEqual([true, true]);
  expect((await db.query<any>(`select count(*)::int n from pg_policies where tablename = 'rank_alerts' and policyname = 'rank_alerts: read own'`)).rows[0].n).toBe(1);
}, 60000);

test('a session logged for an earlier day keeps its date, up to 7 days back', async () => {
  const db = new PGlite();
  await db.exec(SUPABASE_STANDINS);
  await db.exec(SCHEMA);
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'b@example.test', '{"name":"Bea","invite":"BLUIES","invite_code":"BLUIES","code":"BLUIES"}')`, [U]);
  await db.exec(`set test.uid = '${U}'`);
  const hangs = JSON.stringify(Array.from({ length: 5 }, (_, i) => ({ set: i + 1, rep: 1, hand: 'both', target: 10, held: 10, full: true })));
  // the season must have started long enough ago for these to be inside it; otherwise only the 7-day rule is checked
  const seasonStart = +new Date((await db.query<any>(`select public.current_season_start() t`)).rows[0].t);
  const save = async (daysAgo: number) => {
    const at = new Date(Date.now() - daysAgo * 864e5).toISOString();
    const r = (await db.query<any>(`insert into public.sessions (created_at, mode, hands, hang, rest, sets, reps, set_rest, edge_mm, hangs) values ($1,'hang','both',10,180,5,1,180,20,$2) returning created_at`, [at, hangs])).rows[0];
    return { sent: +new Date(at), kept: +new Date(r.created_at) };
  };
  const three = await save(3);
  if (three.sent >= seasonStart) expect(three.kept).toBe(three.sent);   // kept as picked
  const ten = await save(10);
  expect(Math.abs(ten.kept - Date.now())).toBeLessThan(60e3);            // too far back: the server's time instead
  const future = await save(-1);
  expect(Math.abs(future.kept - Date.now())).toBeLessThan(60e3);         // in the future: the server's time
}, 60000);
