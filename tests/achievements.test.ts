import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tierOf, TIERED, ONE_OFFS, TIER_NAMES, TIER_COLOURS, diffUnlocks, bumpDaily } from '../src/lib/achievements';
import { addDays } from '../src/lib/scoring';
import { ctx, hang, session, sessionAt } from './helpers';
import type { Session } from '../src/lib/types';

const tiered = (name: string) => TIERED.find(t => t.name === name)!;
const oneOff = (name: string) => ONE_OFFS.find(o => o.name === name)!;
const days = (start: Date, n: number, over: Partial<Session> = {}) =>
  Array.from({ length: n }, (_, i) => { const d = addDays(start, i); return sessionAt(d.getFullYear(), d.getMonth() + 1, d.getDate(), 18, over); });

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 10, 22, 12)); });
afterEach(() => { vi.useRealTimers(); });

describe('tier tables', () => {
  it('every tiered achievement has 10 thresholds, monotonic in the right direction', () => {
    expect(TIER_NAMES).toHaveLength(10);
    expect(TIER_COLOURS).toHaveLength(10);
    for (const a of TIERED) {
      expect(a.thresholds, a.name).toHaveLength(10);
      const sorted = [...a.thresholds].sort((x, y) => (a.lower ? y - x : x - y));
      expect(a.thresholds, a.name).toEqual(sorted);
    }
  });
});

describe('tierOf', () => {
  const t = tiered('Sessions').thresholds; // 1, 5, 10, ...
  const edge = tiered('Smallest edge');    // 25, 20, 18, 15, ... lower is better

  it('higher-is-better', () => {
    expect(tierOf(0, t)).toBe(0);
    expect(tierOf(1, t)).toBe(1);
    expect(tierOf(4, t)).toBe(1);
    expect(tierOf(5, t)).toBe(2);
    expect(tierOf(1000, t)).toBe(10);
    expect(tierOf(99999, t)).toBe(10);
  });

  it('lower-is-better (Smallest edge)', () => {
    expect(edge.lower).toBe(true);
    expect(tierOf(30, edge.thresholds, true)).toBe(0);
    expect(tierOf(25, edge.thresholds, true)).toBe(1);
    expect(tierOf(20, edge.thresholds, true)).toBe(2);
    expect(tierOf(15, edge.thresholds, true)).toBe(4);
    expect(tierOf(5, edge.thresholds, true)).toBe(10);
  });

  it('null value is tier 0', () => {
    expect(tierOf(null, t)).toBe(0);
    expect(tierOf(null, edge.thresholds, true)).toBe(0);
    expect(tierOf(edge.value(ctx()), edge.thresholds, true)).toBe(0);
  });
});

describe('diffUnlocks', () => {
  it('first session reports tier-ups and new one-offs', () => {
    const s = sessionAt(2026, 11, 22, 12, { grip: 'Half crimp', protocolKey: 'max', edgeMm: 20, fullHangs: 5, totalHangs: 5 });
    expect(diffUnlocks(ctx(), ctx({ sessions: [s] }))).toEqual([
      { icon: '🧗', text: 'Sessions → Iron' },
      { icon: '🤏', text: 'Crimp sessions → Iron' },
      { icon: '📅', text: 'Training days → Iron' },
      { icon: '👶', text: 'First Hang' },
      { icon: '💯', text: 'Perfect Session' },
    ]);
  });

  it('"best" badges need the level in 3 different sessions, not one lucky hang', () => {
    const at = (edgeMm: number, held: number) => sessionAt(2026, 11, 22, 12, { edgeMm, fullHangs: 1, totalHangs: 1, hangs: [{ set: 1, rep: 1, hand: 'both', target: held, held, full: true }] });
    const edge = TIERED.find(t => t.name === 'Smallest edge')!, long = TIERED.find(t => t.name === 'Longest hang')!;
    expect(edge.value(ctx({ sessions: [at(14, 10)] }))).toBeNull();
    expect(edge.value(ctx({ sessions: [at(14, 10), at(15, 10)] }))).toBeNull();
    expect(edge.value(ctx({ sessions: [at(14, 10), at(15, 10), at(18, 10)] }))).toBe(18); // 18mm is held in 3 sessions
    expect(long.value(ctx({ sessions: [at(20, 60), at(20, 30), at(20, 31)] }))).toBe(30); // one 60s hang doesn't count yet
  });

  it('reports a tier-up between existing tiers', () => {
    const four = Array.from({ length: 4 }, () => session({ grip: 'Open', protocolKey: 'jlmh' }));
    const five = [...four, session({ grip: 'Open', protocolKey: 'jlmh' })];
    expect(diffUnlocks(ctx({ sessions: four }), ctx({ sessions: five }))).toEqual([
      { icon: '🧗', text: 'Sessions → Bronze' },
      { icon: '✋', text: 'Open-hand sessions → Bronze' },
    ]);
  });

  it('prefixes secret one-offs', () => {
    const before = ctx({ sessions: [session()] });
    const after = ctx({ sessions: [...before.sessions] , flags: { dramaticExit: true } });
    expect(diffUnlocks(before, after)).toEqual([{ icon: '🏳️', text: 'Secret: Dramatic Exit' }]);
  });

  it('reports nothing when nothing changed, and never reports losing a tier', () => {
    const c = ctx({ sessions: [session(), session()] });
    expect(diffUnlocks(c, c)).toEqual([]);
    expect(diffUnlocks(c, ctx())).toEqual([]);
  });

  it('week streak tier uses the current date', () => {
    // system time is Sun 22 Nov; two sessions last week (w/c 9 Nov) keep a 1-week streak alive
    const ss = [sessionAt(2026, 11, 10), sessionAt(2026, 11, 12)];
    expect(tiered('Week streak').value(ctx({ sessions: ss }))).toBe(1);
    vi.setSystemTime(new Date(2026, 10, 30, 12)); // two weeks later: broken
    expect(tiered('Week streak').value(ctx({ sessions: ss }))).toBe(0);
  });
});

describe('one-offs', () => {
  it('Groundhog Day: 7 consecutive days with the same protocol (across the Oct clock change)', () => {
    const run = days(new Date(2026, 9, 21), 7, { protocolKey: 'abra' }); // Wed 21 – Tue 27 Oct
    expect(oneOff('Groundhog Day').got(ctx({ sessions: run }))).toBe(true);
    expect(diffUnlocks(ctx({ sessions: run.slice(0, 6) }), ctx({ sessions: run }))).toContainEqual({ icon: '🔁', text: 'Secret: Groundhog Day' });
  });

  it('Groundhog Day: 6 days is not enough', () => {
    expect(oneOff('Groundhog Day').got(ctx({ sessions: days(new Date(2026, 9, 21), 6) }))).toBe(false);
  });

  it('Groundhog Day: a different protocol on one day breaks the run', () => {
    const run = days(new Date(2026, 9, 21), 7, { protocolKey: 'abra' });
    run[3] = { ...run[3]!, protocolKey: 'max' };
    expect(oneOff('Groundhog Day').got(ctx({ sessions: run }))).toBe(false);
  });

  it('Groundhog Day: extra protocols on the same days do not matter', () => {
    const run = [...days(new Date(2026, 2, 26), 7, { protocolKey: 'abra' }), sessionAt(2026, 3, 28, 9, { protocolKey: 'max' })];
    expect(oneOff('Groundhog Day').got(ctx({ sessions: run.reverse() }))).toBe(true);
  });

  it('Night Owl / Dawn Patrol / 3am use local hours', () => {
    // 23:30 BST on 1 Jul is 22:30 UTC
    expect(oneOff('Night Owl').got(ctx({ sessions: [session({ createdAt: '2026-07-01T22:30:00.000Z' })] }))).toBe(true);
    expect(oneOff('Night Owl').got(ctx({ sessions: [session({ createdAt: '2026-12-01T22:30:00.000Z' })] }))).toBe(false);
    expect(oneOff('Dawn Patrol').got(ctx({ sessions: [sessionAt(2026, 7, 1, 5)] }))).toBe(true);
    expect(oneOff('Dawn Patrol').got(ctx({ sessions: [sessionAt(2026, 7, 1, 3)] }))).toBe(false);
    expect(oneOff('3am Thoughts').got(ctx({ sessions: [sessionAt(2026, 7, 1, 3)] }))).toBe(true);
  });

  it('Ambidextrous: left and right within 5%', () => {
    const s = (l: number, r: number) => session({ hands: 'LR', hangs: [hang({ hand: 'L', held: l }), hang({ hand: 'R', held: r })] });
    expect(oneOff('Ambidextrous').got(ctx({ sessions: [s(20, 19)] }))).toBe(true);
    expect(oneOff('Ambidextrous').got(ctx({ sessions: [s(20, 18)] }))).toBe(false);
  });

  it('PB Machine: 3 PBs within 7 days', () => {
    const pb = (d: number) => sessionAt(2026, 11, d, 12, { isPb: true });
    expect(oneOff('PB Machine').got(ctx({ sessions: [pb(1), pb(4), pb(7)] }))).toBe(true);
    expect(oneOff('PB Machine').got(ctx({ sessions: [pb(1), pb(5), pb(9)] }))).toBe(false);
  });

  it('Let It Go: 5 early let-gos in one session', () => {
    const s = session({ hangs: Array.from({ length: 5 }, () => hang({ held: 3, full: false })) });
    expect(oneOff('Let It Go').got(ctx({ sessions: [s] }))).toBe(true);
  });
});

describe('bumpDaily', () => {
  it('counts up within a day', () => {
    const flags: Record<string, any> = {};
    expect(bumpDaily(flags, 'peep')).toBe(1);
    expect(bumpDaily(flags, 'peep')).toBe(2);
    expect(bumpDaily(flags, 'peep')).toBe(3);
    expect(flags).toEqual({ peepDay: '2026-11-22', peepCount: 3 });
  });

  it('resets on a new local day', () => {
    const flags: Record<string, any> = {};
    vi.setSystemTime(new Date(2026, 10, 22, 23, 59));
    bumpDaily(flags, 'spin'); bumpDaily(flags, 'spin');
    vi.setSystemTime(new Date(2026, 10, 23, 0, 1));
    expect(bumpDaily(flags, 'spin')).toBe(1);
    expect(flags.spinDay).toBe('2026-11-23');
  });

  it('uses the local day, not the UTC day (00:30 BST is still the previous day in UTC)', () => {
    const flags: Record<string, any> = { spinDay: '2026-06-30', spinCount: 9 };
    vi.setSystemTime(new Date('2026-06-30T23:30:00.000Z')); // 1 Jul 00:30 BST
    expect(bumpDaily(flags, 'spin')).toBe(1);
    expect(flags.spinDay).toBe('2026-07-01');
  });

  it('keeps separate counters per key', () => {
    const flags: Record<string, any> = {};
    bumpDaily(flags, 'a'); bumpDaily(flags, 'a');
    expect(bumpDaily(flags, 'b')).toBe(1);
    expect(flags.aCount).toBe(2);
  });
});
