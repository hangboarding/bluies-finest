import { describe, it, expect } from 'vitest';
import {
  weekStart, addDays, parseDayKey, weekStreak, bestDayRun, dayKey,
  sessionPoints, intensity, edgeFactor, loadPct, liftPct, CATEGORIES,
} from '../src/lib/scoring';
import { session, sessionAt } from './helpers';
import type { Session } from '../src/lib/types';

// All dates here are Europe/London (see vitest.config.ts).
// 2026: BST starts Sun 29 Mar 01:00 GMT, ends Sun 25 Oct 02:00 BST.
const H = 3600e3;
const cat = (id: string) => CATEGORIES.find(c => c.id === id)!;

/** Two sessions in each of the given weeks; week 0 is the week of `mon`, 1 the week before, etc. */
function twoPerWeek(mon: Date, weeksBack: number[], hour = 12): Session[] {
  return weeksBack.flatMap(w => {
    const m = addDays(mon, -7 * w);
    return [
      sessionAt(m.getFullYear(), m.getMonth() + 1, m.getDate(), hour),
      sessionAt(m.getFullYear(), m.getMonth() + 1, m.getDate() + 2, hour),
    ];
  });
}

describe('weekStart', () => {
  it('returns local Monday 00:00', () => {
    const w = weekStart(new Date(2026, 10, 18, 15, 30)); // Wed 18 Nov
    expect(w.getDay()).toBe(1);
    expect([w.getFullYear(), w.getMonth(), w.getDate(), w.getHours(), w.getMinutes()]).toEqual([2026, 10, 16, 0, 0]);
  });

  it('Sunday belongs to the week starting the previous Monday', () => {
    expect(dayKey(weekStart(new Date(2026, 10, 22, 23, 59)))).toBe('2026-11-16');
    expect(dayKey(weekStart(new Date(2026, 10, 23, 0, 0)))).toBe('2026-11-23');
  });

  it('is local Monday midnight on both sides of the October clock change', () => {
    const before = weekStart(new Date(2026, 9, 25, 12)); // Sun 25 Oct (the change day, now GMT)
    const after = weekStart(new Date(2026, 9, 26, 0, 30)); // Mon 26 Oct 00:30 GMT
    expect(dayKey(before)).toBe('2026-10-19');
    expect(before.getHours()).toBe(0);
    expect(before.toISOString()).toBe('2026-10-18T23:00:00.000Z'); // midnight BST
    expect(dayKey(after)).toBe('2026-10-26');
    expect(after.toISOString()).toBe('2026-10-26T00:00:00.000Z'); // midnight GMT
    expect(+after - +before).toBe(7 * 24 * H + H); // that week was 169 hours long
  });

  it('is local Monday midnight across the March clock change', () => {
    const before = weekStart(new Date(2026, 2, 29, 12));
    const after = weekStart(new Date(2026, 2, 31, 9));
    expect(dayKey(before)).toBe('2026-03-23');
    expect(dayKey(after)).toBe('2026-03-30');
    expect(after.getHours()).toBe(0);
    expect(+after - +before).toBe(7 * 24 * H - H);
  });

  it('a session at 00:30 BST on a Monday (still Sunday in UTC) counts in the new week', () => {
    const d = new Date('2026-10-18T23:30:00.000Z'); // Mon 19 Oct 00:30 BST
    expect(dayKey(weekStart(d))).toBe('2026-10-19');
  });
});

describe('addDays / parseDayKey / dayKey', () => {
  it('addDays keeps local wall-clock time across DST (25h day)', () => {
    const a = new Date(2026, 9, 24, 12), b = addDays(a, 1);
    expect(dayKey(b)).toBe('2026-10-25');
    expect(b.getHours()).toBe(12);
    expect(+b - +a).toBe(25 * H);
  });

  it('addDays accepts a timestamp and negative n', () => {
    expect(dayKey(addDays(+new Date(2026, 2, 30), -1))).toBe('2026-03-29');
  });

  it('parseDayKey gives local midnight, not UTC', () => {
    const d = parseDayKey('2026-07-01');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 6, 1, 0]);
    expect(d.toISOString()).toBe('2026-06-30T23:00:00.000Z');
    expect(dayKey(d)).toBe('2026-07-01');
  });

  it('dayKey uses the local date and zero-pads', () => {
    expect(dayKey(new Date('2026-06-30T23:30:00.000Z'))).toBe('2026-07-01');
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('weekStreak', () => {
  const now = new Date(2026, 10, 18, 18); // Wed 18 Nov 2026, week of Mon 16 Nov
  const mon = weekStart(now);

  it('regression: counts consecutive weeks across the 25 Oct 2026 clock change', () => {
    // 10 weeks: 16 Nov back to 14 Sep — 5 GMT weeks and 5 BST weeks
    expect(weekStreak(twoPerWeek(mon, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), now)).toBe(10);
  });

  it('handles sessions just after local Monday midnight on both sides of the change', () => {
    // 00:30 local on Monday is still Sunday in UTC during BST
    expect(weekStreak(twoPerWeek(mon, [0, 1, 2, 3, 4, 5, 6, 7], 0), now)).toBe(8);
  });

  it('handles sessions late on Sunday night', () => {
    const ss = [0, 1, 2, 3, 4, 5, 6, 7].flatMap(w => {
      const sun = addDays(mon, -7 * w - 1); // Sunday ending the previous week
      return [sessionAt(sun.getFullYear(), sun.getMonth() + 1, sun.getDate(), 23), sessionAt(sun.getFullYear(), sun.getMonth() + 1, sun.getDate() - 2, 23)];
    });
    expect(weekStreak(ss, now)).toBe(8);
  });

  it('does not break because the current week has fewer than 2 sessions yet', () => {
    const past = twoPerWeek(mon, [1, 2, 3, 4, 5]);
    expect(weekStreak(past, now)).toBe(5);
    expect(weekStreak([...past, sessionAt(2026, 11, 17)], now)).toBe(5);
  });

  it('counts the current week once it has 2 sessions', () => {
    expect(weekStreak(twoPerWeek(mon, [0, 1, 2]), now)).toBe(3);
  });

  it('breaks on a gap week', () => {
    expect(weekStreak(twoPerWeek(mon, [0, 1, 3, 4, 5, 6]), now)).toBe(2);
  });

  it('a week with only 1 session breaks the streak', () => {
    const ss = [...twoPerWeek(mon, [1, 2, 4, 5]), sessionAt(2026, 10, 27)]; // week 3 (26 Oct) has 1
    expect(weekStreak(ss, now)).toBe(2);
  });

  it('is 0 when neither this week nor last week has 2 sessions', () => {
    expect(weekStreak(twoPerWeek(mon, [2, 3, 4]), now)).toBe(0);
    expect(weekStreak([], now)).toBe(0);
  });

  it('ignores session order', () => {
    expect(weekStreak(twoPerWeek(mon, [0, 1, 2, 3, 4, 5]).reverse(), now)).toBe(6);
  });
});

describe('bestDayRun', () => {
  it('counts consecutive days across the October clock change', () => {
    expect(bestDayRun(new Set(['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27']))).toBe(5);
  });

  it('counts consecutive days across the March clock change', () => {
    expect(bestDayRun(new Set(['2026-03-28', '2026-03-29', '2026-03-30']))).toBe(3);
  });

  it('returns the longest of several runs, in any insertion order', () => {
    expect(bestDayRun(new Set(['2026-11-20', '2026-10-01', '2026-11-18', '2026-10-02', '2026-11-19', '2026-11-21']))).toBe(4);
  });

  it('crosses month and year boundaries', () => {
    expect(bestDayRun(new Set(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']))).toBe(4);
    expect(bestDayRun(new Set(['2028-02-28', '2028-02-29', '2028-03-01']))).toBe(3);
  });

  it('works with day keys built from session timestamps', () => {
    const ss = [sessionAt(2026, 10, 24, 23), sessionAt(2026, 10, 25, 0), sessionAt(2026, 10, 26, 0)];
    expect(bestDayRun(new Set(ss.map(s => dayKey(new Date(s.createdAt)))))).toBe(3);
  });

  it('empty set is 0, single day is 1', () => {
    expect(bestDayRun(new Set())).toBe(0);
    expect(bestDayRun(new Set(['2026-11-22']))).toBe(1);
  });
});

describe('points', () => {
  const pts = (over: Partial<Parameters<typeof session>[0]>) => sessionPoints(session({ mode: 'hang', hands: 'both', tutS: 50, loadPct: 100, edgeMm: 20, fullHangs: 5, totalHangs: 5, isPb: false, ...over } as any));

  it('5 + 40·ln(1 + work/40) + share of full hangs × 10 + PB 10', () => {
    // work = 50 × 1² × 1 = 50 → 40·ln(2.25) = 32.44; +10 for every hang held → 47.4 → 47
    expect(pts({})).toBe(47);
    expect(pts({ isPb: true })).toBe(57);
    expect(pts({ fullHangs: 0 })).toBe(37);
  });

  it('more weight always means more points, and clearly so', () => {
    const bw = pts({ loadPct: 100 }), plus10 = pts({ loadPct: 110 }), plus20 = pts({ loadPct: 120 }), plus50 = pts({ loadPct: 150 });
    expect(plus10).toBeGreaterThan(bw);
    expect(plus20).toBeGreaterThan(plus10);
    expect(plus50).toBeGreaterThan(plus20);
    expect(pts({ loadPct: 80 })).toBeLessThan(bw); // assisted scores less
  });

  it('a heavy Max Hangs session is worth about as much as a long Repeaters session', () => {
    const max = pts({ tutS: 50, loadPct: 140, fullHangs: 5, totalHangs: 5 });                 // 5 × 10s at +40%
    const rep = pts({ tutS: 252, loadPct: 80, fullHangs: 36, totalHangs: 36 });               // 36 × 7s assisted
    const easy = pts({ tutS: 300, loadPct: 50, fullHangs: 30, totalHangs: 30 });              // lots of easy volume
    expect(Math.abs(max - rep)).toBeLessThanOrEqual(20); // 65 vs 80: repeaters are a longer workload, but not a runaway
    expect(easy).toBeLessThan(max);
  });

  it('one-arm hangs count double the load', () => {
    expect(intensity({ mode: 'hang', hands: 'LR', loadPct: 100, effortPct: 0 })).toBe(2);
    expect(intensity({ mode: 'hang', hands: 'L', loadPct: 80, effortPct: 0 })).toBe(1.6);
    expect(pts({ hands: 'LR' })).toBeGreaterThan(pts({ hands: 'both' }));
  });

  it('lifts score by weight lifted (stored as per-hand kg × 2 ÷ bodyweight), falling back to target effort', () => {
    expect(liftPct(70, 35)).toBe(100);
    expect(liftPct(70, 42)).toBe(120);
    expect(liftPct(null, 40)).toBeNull();
    const light = pts({ mode: 'lift', loadPct: liftPct(70, 30) }), heavy = pts({ mode: 'lift', loadPct: liftPct(70, 45) });
    expect(heavy).toBeGreaterThan(light);
    expect(intensity({ mode: 'lift', hands: 'both', loadPct: null, effortPct: 50 })).toBe(0.5);
  });

  it('edgeFactor clamps to 0.6–1.6 and smaller edges score more', () => {
    expect(edgeFactor(20)).toBe(1);
    expect(edgeFactor(5)).toBe(1.6);
    expect(edgeFactor(0)).toBe(1.6);
    expect(edgeFactor(50)).toBe(0.6);
    expect(edgeFactor(16)).toBe(1.25);
    expect(pts({ edgeMm: 14 })).toBeGreaterThan(pts({ edgeMm: 20 }));
  });

  it('intensity clamps to 0.4–3 and defaults sensibly', () => {
    expect(intensity({ mode: 'hang', hands: 'both', loadPct: 350, effortPct: 60 })).toBe(3);
    expect(intensity({ mode: 'hang', hands: 'both', loadPct: 20, effortPct: 60 })).toBe(0.4);
    expect(intensity({ mode: 'hang', hands: 'both', loadPct: null, effortPct: 60 })).toBe(1);
    expect(intensity({ mode: 'lift', hands: 'both', loadPct: null, effortPct: 0 })).toBe(0.6);
  });
});

describe('loadPct', () => {
  it('rounds to a whole percentage', () => {
    expect(loadPct(70, 5, 0)).toBe(107); // 107.14
    expect(loadPct(70, 0, 10)).toBe(86); // 85.71
    expect(loadPct(80, 0, 0)).toBe(100);
    expect(Number.isInteger(loadPct(73.3, 2.5, 0))).toBe(true);
  });

  it('returns null without a bodyweight', () => {
    expect(loadPct(null, 10, 0)).toBeNull();
    expect(loadPct(0, 10, 0)).toBeNull();
  });

  it('stays within the 10–400% the database accepts, so a session can always be saved', () => {
    expect(loadPct(60, 0, 55)).toBe(10);   // would be 8%
    expect(loadPct(40, 150, 0)).toBe(400); // would be 475%
  });
});

describe('CATEGORIES', () => {
  const now = new Date(2026, 10, 18, 18);

  it('overall = points in the last 28 days + 15 per streak week', () => {
    const ss = [
      sessionAt(2026, 11, 16, 12, { points: 50 }), sessionAt(2026, 11, 17, 12, { points: 50 }),
      sessionAt(2026, 11, 10, 12, { points: 30 }), sessionAt(2026, 11, 12, 12, { points: 70 }),
      sessionAt(2026, 10, 1, 12, { points: 1000 }), // > 28 days ago, single session that week
    ];
    expect(cat('overall').value(ss, ss, now)).toBe(200 + 15 * 2);
  });

  it('smallest edge is lower-is-better and only counts full bodyweight hangs', () => {
    const c = cat('edge');
    expect(c.lower).toBe(true);
    const ss = [
      session({ edgeMm: 20 }),
      session({ edgeMm: 14 }),
      session({ edgeMm: 10, assistKg: 5 }),          // assisted
      session({ edgeMm: 12, fullHangs: 0 }),          // never held full time
      session({ edgeMm: 8, mode: 'lift' }),           // no-hang
    ];
    expect(c.value(ss, ss, now)).toBe(14);
    expect(c.value([], [], now)).toBeNull();
  });

  it('added weight only counts ≤15s full hangs on an 18–22mm edge', () => {
    const c = cat('added');
    const ss = [
      session({ edgeMm: 18, addedKg: 10 }),
      session({ edgeMm: 22, addedKg: 12 }),
      session({ edgeMm: 23, addedKg: 30 }),
      session({ edgeMm: 17, addedKg: 25 }),
      session({ edgeMm: 20, addedKg: 40, hang: 30 }),
      session({ edgeMm: 20, addedKg: 15, fullHangs: 0 }),
    ];
    expect(c.value(ss, ss, now)).toBe(12);
    expect(c.value([session({ edgeMm: 20, addedKg: 0, assistKg: 5 })], [], now)).toBe(-5);
    expect(c.value([session({ edgeMm: 25, addedKg: 10 })], [], now)).toBeNull();
  });

  it('weekly streak category matches weekStreak', () => {
    const ss = twoPerWeek(weekStart(now), [1, 2, 3, 4, 5, 6]);
    expect(cat('streak').value(ss, ss, now)).toBe(6);
  });

  it('every category has a unique id', () => {
    const ids = CATEGORIES.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('favouriteProtocol', () => {
  it('returns null with no sessions and ignores warm-ups', async () => {
    const { favouriteProtocol } = await import('../src/lib/scoring');
    const { session } = await import('./helpers');
    expect(favouriteProtocol([])).toBeNull();
    expect(favouriteProtocol([session({ protocolKey: 'warm', protocolName: 'Warm-up' })])).toBeNull();
  });
  it('picks the most used, breaking ties by most recent', async () => {
    const { favouriteProtocol } = await import('../src/lib/scoring');
    const { session } = await import('./helpers');
    const xs = [
      session({ protocolKey: 'max', protocolName: 'Max Hangs', createdAt: '2026-11-01T10:00:00Z' }),
      session({ protocolKey: 'rep', protocolName: 'Repeaters', createdAt: '2026-11-03T10:00:00Z' }),
      session({ protocolKey: 'max', protocolName: 'Max Hangs', createdAt: '2026-11-02T10:00:00Z' }),
      session({ protocolKey: 'warm', protocolName: 'Warm-up', createdAt: '2026-11-04T10:00:00Z' }),
    ];
    expect(favouriteProtocol(xs)).toEqual({ key: 'max', name: 'Max Hangs', count: 2, pct: 67 });
    const tie = [xs[0]!, xs[1]!];
    expect(favouriteProtocol(tie)!.key).toBe('rep');
  });
});
