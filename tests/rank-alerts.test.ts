// "Sam just took your #2 spot": who a new session knocks down the top 3 of the Overall board
// (supabase/functions/notify/rank.ts, shared by the notify server function and demo mode).
import { describe, it, expect, beforeEach } from 'vitest';
import { overtaken, overallTotals, places, poolStart, type RankSession } from '../supabase/functions/notify/rank';
import { CATEGORIES } from '../src/lib/scoring';
import { session } from './helpers';
import type { Session } from '../src/lib/types';

const NOW = Date.parse('2026-11-25T02:00:00Z'); // a Wednesday, early afternoon in the Blue Mountains
let n = 0;
/** A session `daysAgo` days before NOW (at the same time of day), worth `points`. */
const s = (user: string, points: number, daysAgo = 1, tut = 60): RankSession =>
  ({ id: `r${++n}`, user_id: user, created_at: new Date(NOW - daysAgo * 864e5).toISOString(), points, tut_s: tut });

/** The board: A 100, B 80, C 60, D 40 (two days ago, under 15s each so no streak bonus comes into it). */
const board = () => [s('A', 100, 2, 0), s('B', 80, 2, 0), s('C', 60, 2, 0), s('D', 40, 2, 0)];

describe('who a session knocks down the top 3', () => {
  it('passing the climber in 3rd', () => {
    const pool = board(), mine = s('D', 30, 0);
    expect(overtaken([...pool, mine], mine, NOW)).toEqual([{ userId: 'C', was: 3, now: 4 }]);
  });
  it('passing two at once tells both', () => {
    const pool = board(), mine = s('D', 55, 0); // 95: past B and C, not A
    expect(overtaken([...pool, mine], mine, NOW)).toEqual([{ userId: 'B', was: 2, now: 3 }, { userId: 'C', was: 3, now: 4 }]);
  });
  it('taking #1', () => {
    const pool = board(), mine = s('B', 25, 0);
    expect(overtaken([...pool, mine], mine, NOW)).toEqual([{ userId: 'A', was: 1, now: 2 }]);
  });
  it('drawing level isn’t taking the place', () => {
    const pool = board(), mine = s('D', 20, 0); // 60, same as C
    expect(overtaken([...pool, mine], mine, NOW)).toEqual([]);
  });
  it('nobody outside the top 3, and nobody who was already behind', () => {
    const pool = [...board(), s('E', 20, 2, 0)], mine = s('E', 25, 0); // E 45 passes D (#4), who isn't in the top 3
    expect(overtaken([...pool, mine], mine, NOW)).toEqual([]);
    const up = s('A', 10, 0); // A was already top
    expect(overtaken([...pool, up], up, NOW)).toEqual([]);
  });
  it('a first-ever session can knock someone down', () => {
    const pool = board(), mine = s('N', 90, 0);
    expect(overtaken([...pool, mine], mine, NOW)).toEqual([{ userId: 'B', was: 2, now: 3 }, { userId: 'C', was: 3, now: 4 }]);
  });
  it('a workout’s sessions arriving together: the one that makes the difference is found either way', () => {
    const pool = board(), one = s('D', 15, 0.01), two = s('D', 15, 0); // 40 + 15 + 15 = 70: only both together pass C
    const all = [...pool, one, two];
    // the first one's alert looks at it with everything after it from the same climber
    expect(overtaken(all, one, NOW)).toEqual([{ userId: 'C', was: 3, now: 4 }]);
    expect(overtaken(all, two, NOW)).toEqual([{ userId: 'C', was: 3, now: 4 }]); // the notify function tells each pair once a day
  });
  it('a session older than the board’s window counts for nothing', () => {
    const old = s('D', 500, 200);
    expect(overtaken([...board(), old], old, NOW)).toEqual([]);
  });
  it('the streak bonus counts: a second training day this week adds 15', () => {
    const pool = [s('A', 100, 2, 0), s('B', 80, 2, 0), s('C', 60, 2, 0), s('D', 40, 2)], mine = s('D', 30, 0); // D: 40 + 30 + 15
    expect(overtaken([...pool, mine], mine, NOW)).toEqual([{ userId: 'B', was: 2, now: 3 }, { userId: 'C', was: 3, now: 4 }]);
  });
  it('equal totals share a place', () => {
    expect(places(new Map([['a', 10], ['b', 8], ['c', 8], ['d', 5]]))).toEqual(new Map([['a', 1], ['b', 2], ['c', 2], ['d', 4]]));
  });
});

describe('the same board as the app’s Ranks page', () => {
  it('Overall totals match the app (28-day points + 15 per streak week)', () => {
    // three climbers, sessions on Tuesdays and Thursdays at midday UTC (the same day in London and Sydney)
    const xs: Session[] = [];
    const tueNoon = Date.parse('2026-11-24T12:00:00Z');
    for (let w = 0; w < 10; w++) for (const [u, every] of [['A', 1], ['B', 2], ['C', 3]] as const) {
      if (w % every) continue;
      for (const d of [0, 2]) xs.push(session({ id: `p${u}${w}${d}`, userId: u, createdAt: new Date(tueNoon - w * 7 * 864e5 + d * 864e5).toISOString(), points: 10 + w, tutS: 40 }));
    }
    const now = new Date('2026-11-27T12:00:00Z');
    const pool = xs.filter(x => +new Date(x.createdAt) >= poolStart(+now) && +new Date(x.createdAt) <= +now);
    const app = new Map(['A', 'B', 'C'].map(u => [u, CATEGORIES[0]!.value(pool.filter(x => x.userId === u), pool, now)]));
    const server = overallTotals(pool.map(x => ({ id: x.id, user_id: x.userId, created_at: x.createdAt, points: x.points, tut_s: x.tutS })), +now);
    expect(server).toEqual(app);
    expect(server.get('A')).toBeGreaterThan(15 * 5); // the streak bonus is in there
  });
});

describe('demo mode', () => {
  beforeEach(() => localStorage.clear());
  it('the climber knocked down sees it in their notifications', async () => {
    const { LocalStore } = await import('../src/lib/local-store');
    const store = new LocalStore();
    (store as any).db.sessions = []; // no pretend climbers on the board
    const add = (points: number) => store.addSession({ ...session(), points, tutS: 60, createdAt: new Date().toISOString() } as any);
    await store.signUp({ email: 'a@x.test', password: 'password1', name: 'Ann', inviteCode: 'BLUIES' });
    const ann = store.currentUserId()!;
    await add(100);
    await store.signUp({ email: 'b@x.test', password: 'password1', name: 'Bo', inviteCode: 'BLUIES' });
    const bo = store.currentUserId()!;
    await add(60);
    expect(await store.notifications()).toEqual([]);
    await add(50); // Bo: 110, past Ann
    await add(50); // further ahead: nothing more for Ann
    await store.signIn('a@x.test', 'password1');
    const ns = (await store.notifications()).filter(x => x.kind === 'rank');
    expect(ns).toHaveLength(1);
    expect(ns[0]).toMatchObject({ kind: 'rank', fromUserId: bo, was: 1, now: 2 });
    expect(ann).not.toBe(bo);
  });
});
