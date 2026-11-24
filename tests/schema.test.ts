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
  for (const c of ['grip', 'fingers', 'board', 'edge_material', 'edge_profile', 'feel', 'effort_pct', 'edge_mm', 'added_kg', 'rpe', 'note', 'mode']) expect(await can('authenticated', c), c).toBe(true);
  for (const c of ['hang', 'rest', 'sets', 'hangs', 'tut_s', 'created_at', 'user_id', 'hands', 'protocol_key', 'is_pb']) expect(await can('authenticated', c), c).toBe(false);

  // session names: saved with it or given later, up to 60 characters; the protocol it was stays as it was
  expect(await can('authenticated', 'title')).toBe(true);
  // renaming one of my own protocols renames it on my sessions too
  expect(await can('authenticated', 'protocol_name')).toBe(true);
  expect(rows.every(r => r.title === '')).toBe(true); // sessions from before names have none
  const named = (await db.query<any>(`insert into public.sessions (protocol_name, title, mode, hands, hang, rest, sets, reps, set_rest, edge_mm, hangs) values ('Max Hangs','Birthday hang','hang','both',10,180,5,1,180,20,$1) returning id, title, points`, [hangs(5, 10)])).rows[0];
  expect(named.title).toBe('Birthday hang');
  const before = named.points;
  const renamed = (await db.query<any>(`update public.sessions set title = 'Deload day' where id = $1 returning title, points, protocol_name`, [named.id])).rows[0];
  expect(renamed).toEqual({ title: 'Deload day', points: before, protocol_name: 'Max Hangs' }); // a name never changes points
  await expect(db.query(`update public.sessions set title = $2 where id = $1`, [named.id, 'x'.repeat(61)])).rejects.toThrow(/sessions_title_len/);
  const proto = (await db.query<any>(`update public.sessions set protocol_name = 'Big Hangs' where id = $1 returning protocol_name, points`, [named.id])).rows[0];
  expect(proto).toEqual({ protocol_name: 'Big Hangs', points: before });
  await expect(db.query(`update public.sessions set protocol_name = $2 where id = $1`, [named.id, 'x'.repeat(81)])).rejects.toThrow(/sessions_protocol_name_len/);
  await db.query(`delete from public.sessions where id = $1`, [named.id]);

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

test('a lift counts only the weight lifted, and a session logged as a hang by mistake can be switched to a lift', async () => {
  const db = new PGlite();
  await db.exec(SUPABASE_STANDINS);
  await db.exec(SCHEMA);
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'c@example.test', '{"name":"Cal","invite":"BLUIES","invite_code":"BLUIES","code":"BLUIES"}')`, [U]);
  await db.query(`update public.private_data set bodyweight_kg = 70 where id = $1`, [U]);
  await db.exec(`set test.uid = '${U}'`);
  const hangs = JSON.stringify(Array.from({ length: 6 }, (_, i) => ({ set: i + 1, rep: 1, hand: 'L', target: 10, held: 10, full: true })));
  const row = async (sql: string, args: unknown[]) => (await db.query<any>(sql, args)).rows[0];
  // the report: a one-arm QUICK SESH with "10 kg" meant as a dumbbell, logged as a hang (bodyweight + 10 kg on one arm)
  const hang = await row(`insert into public.sessions (protocol_key, mode, hands, hang, rest, sets, reps, set_rest, edge_mm, added_kg, hangs) values ('jlmh','hang','L',10,60,6,1,180,20,10,$1) returning id, load_pct, points`, [hangs]);
  expect(hang.load_pct).toBe(114);
  // the same, as a lift: only the 10 kg counts (per hand × 2 ÷ bodyweight)
  const lift = await row(`insert into public.sessions (protocol_key, mode, hands, hang, rest, sets, reps, set_rest, edge_mm, lift_kg, hangs) values ('jlmh','lift','L',10,60,6,1,180,20,10,$1) returning load_pct, points`, [hangs]);
  expect(lift.load_pct).toBe(29);
  expect(lift.points).toBeLessThan(hang.points / 4);
  // fixing the first one in Edit session: switched to a lift, its load and points are worked out again
  const fixed = await row(`update public.sessions set mode = 'lift', lift_kg = 10, added_kg = 0 where id = $1 returning load_pct, points`, [hang.id]);
  expect(fixed.load_pct).toBe(29);
  expect(fixed.points).toBeLessThan(hang.points / 4);
  // a 0 kg lift switched from a hang with nothing added still changes (only the mode differs)
  const bare = await row(`insert into public.sessions (protocol_key, mode, hands, hang, rest, sets, reps, set_rest, edge_mm, hangs) values ('jlmh','hang','both',10,60,6,1,180,20,$1) returning id, load_pct`, [hangs]);
  expect(bare.load_pct).toBe(100);
  expect((await row(`update public.sessions set mode = 'lift' where id = $1 returning load_pct`, [bare.id])).load_pct).toBe(10); // the floor

  // a light lift scores only what it lifts (no 40% floor, unlike a hang), exactly as the app works it out
  const U2 = '22222222-2222-2222-2222-222222222222';
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'd@example.test', '{"name":"Dee","invite":"BLUIES","invite_code":"BLUIES","code":"BLUIES"}')`, [U2]);
  await db.query(`update public.private_data set bodyweight_kg = 70 where id = $1`, [U2]);
  await db.exec(`set test.uid = '${U2}'`);
  const light = await row(`insert into public.sessions (protocol_key, mode, hands, hang, rest, sets, reps, set_rest, edge_mm, lift_kg, hangs) values ('max','lift','both',10,60,6,1,180,20,5,$1) returning *`, [hangs.replace(/"L"/g, '"both"')]);
  expect(light.load_pct).toBe(14);
  const asApp = { id: light.id, createdAt: new Date(light.created_at).toISOString(), mode: 'lift', hands: 'both', hang: 10, protocolKey: 'max', edgeMm: 20, addedKg: 0, assistKg: 0, liftKg: 5,
    tutS: light.tut_s, fullHangs: light.full_hangs, totalHangs: light.total_hangs, loadPct: 14, isPb: light.is_pb };
  expect(light.points).toBe(sessionPoints(asApp as any, [asApp as any]));
  expect(light.points).toBeLessThan(sessionPoints({ ...asApp, loadPct: 40 } as any, []));
}, 60000);
