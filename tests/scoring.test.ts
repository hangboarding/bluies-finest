import { describe, it, expect } from 'vitest';
import {
  weekStart, addDays, parseDayKey, weekStreak, bestDayRun, dayKey,
  sessionPoints, intensity, edgeFactor, loadPct, liftPct, CATEGORIES, sessionWork, rescoreFrom, scoringDay, completedSets,
  setPoints, holdFactor, trainedRegularly, scoringLocked,
} from '../src/lib/scoring';
import { session, sessionAt } from './helpers';
import type { HangResult, Session } from '../src/lib/types';

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

describe('points (v4: every set scores)', () => {
  /** A hang log: `sets` × `reps` × `t` seconds, held in full unless `held` says otherwise. LR = left then right. */
  const log = (sets: number, reps: number, t: number, hands: Session['hands'] = 'both', held = t): HangResult[] =>
    Array.from({ length: sets }, (_, s) => Array.from({ length: reps }, (_, r) =>
      (hands === 'LR' ? ['L', 'R'] as const : [hands === 'both' ? 'both' : hands] as const).map(hand => ({ set: s + 1, rep: r + 1, hand, target: t, held, full: held >= t })))).flat(2);
  /** A session with its totals worked out from its log (as the database does). */
  const logged = (over: Partial<Session> = {}, hangs = log(5, 1, 10, over.hands ?? 'both')) =>
    session({ mode: 'hang', hands: 'both', loadPct: 100, edgeMm: 20, isPb: false, grip: 'Half crimp', fingers: 'All 4', ...over,
      hangs, tutS: hangs.reduce((a, h) => a + Math.min(h.held, h.target), 0), fullHangs: hangs.filter(h => h.held >= h.target).length, totalHangs: hangs.length });
  const pts = (over: Partial<Session> = {}, hangs?: HangResult[], others: Session[] = []) => sessionPoints(logged(over, hangs), others);
  const repeaters = (sets: number) => log(sets, 6, 7);
  const L = (over: Partial<Session> = {}) => ({ mode: 'hang' as Session['mode'], hands: 'both' as Session['hands'], loadPct: null as number | null, addedKg: 0, assistKg: 0, liftKg: 0, ...over });

  it('each set earns 10 × time, +25% when every hang in it was held full time; 5 for showing up, 10 for a PB', () => {
    // 5 × 10s at bodyweight: 5 sets × 10 × 1 × 1.25 = 62.5, + 5 → 68
    expect(pts()).toBe(68);
    expect(pts({ isPb: true })).toBe(78);
    // the third hang let go at 6s: that set scores its 6s with no bonus → 4 × 12.5 + 6 + 5 = 61
    const hangs = log(5, 1, 10); hangs[2] = { ...hangs[2]!, held: 6, full: false };
    expect(pts({}, hangs)).toBe(61);
    // a 7s × 6 repeater set (42s held): 10 × √4.2 × 1.25 ≈ 25.6
    expect(setPoints({ hands: 'both', hangs: repeaters(1) })).toBeCloseTo(25.62, 2);
    expect(setPoints({ hands: 'both', hangs: [] })).toBe(0);
  });

  it('one set can’t earn what a whole session does', () => {
    // The report: one Repeaters set at +100% scored 87 under the old rules, the same as six sets at 80% (86).
    const oneHeavy = pts({ loadPct: 200 }, repeaters(1)), sixAt80 = pts({ loadPct: 80 }, repeaters(6));
    expect(oneHeavy).toBeLessThan(sixAt80 / 2);
    const one = pts({}, repeaters(1)), six = pts({}, repeaters(6));
    expect(six).toBeGreaterThan(4 * one);
    // every extra set adds about the same
    const gains = [1, 2, 3, 4, 5].map(n => pts({}, repeaters(n + 1)) - pts({}, repeaters(n)));
    for (const g of gains) expect(Math.abs(g - 26)).toBeLessThanOrEqual(1);
  });

  it('load counts in proportion: +100% doubles a set’s points, and more weight always scores more', () => {
    const w = (loadPct: number) => sessionWork(logged({ loadPct }));
    expect(w(200)).toBeCloseTo(2 * w(100));
    expect(w(150)).toBeCloseTo(1.5 * w(100));
    const bw = pts({ loadPct: 100 }), plus10 = pts({ loadPct: 110 }), plus20 = pts({ loadPct: 120 }), plus50 = pts({ loadPct: 150 });
    expect(plus10).toBeGreaterThan(bw);
    expect(plus20).toBeGreaterThan(plus10);
    expect(plus50).toBeGreaterThan(plus20);
    expect(pts({ loadPct: 80 })).toBeLessThan(bw); // assisted scores less
  });

  it('time in a set counts in full up to 10s, then with diminishing returns, so chopping sets up gains nothing', () => {
    const sp = (hangs: HangResult[]) => setPoints({ hands: 'both', hangs });
    expect(sp(log(1, 1, 40))).toBeCloseTo(25);                   // 40s: 10 × √4 × 1.25
    expect(sp(log(10, 1, 1))).toBeCloseTo(sp(log(1, 1, 10)));     // ten 1s "sets" = one 10s set
    expect(sp(log(1, 1, 300))).toBeLessThan(sp(log(6, 1, 10)));   // one huge hang < six real sets
  });

  it('a heavy Max Hangs session holds its own against a long Repeaters session, and easy volume stays below both', () => {
    const max = pts({ protocolKey: 'max', loadPct: 140 });                       // 5 × 10s at +40%
    const rep = pts({ protocolKey: 'rep', loadPct: 80 }, repeaters(6));          // 6 sets of 7s × 6, assisted
    const easy = pts({ protocolKey: 'dens', loadPct: 50 }, log(4, 1, 30));        // long, easy hangs
    expect(max).toBeGreaterThan(0.6 * rep);
    expect(easy).toBeLessThan(max);
  });

  it('the hold: harder grips, fewer fingers and one-arm hangs score more, together at most ×2', () => {
    const h = (over: Partial<Session>) => holdFactor({ mode: 'hang', hands: 'both', grip: 'Half crimp', fingers: 'All 4', ...over });
    expect(h({})).toBe(1);
    expect(h({ grip: 'Full crimp' })).toBe(1);
    expect(h({ grip: 'Open' })).toBe(1.1);
    expect(h({ grip: 'Drag' })).toBe(1.1);
    expect(h({ grip: 'Pinch' })).toBe(1.2);
    expect(h({ grip: 'Sloper' })).toBe(1.2);
    expect(h({ fingers: 'Front 3' })).toBe(1.15);
    expect(h({ fingers: 'Middle 2' })).toBe(1.3);
    expect(h({ fingers: 'Mono' })).toBe(1.5);
    expect(h({ fingers: 'Custom' })).toBe(1);
    expect(h({ grip: '', fingers: '' })).toBe(1);                         // not picked
    expect(h({ grip: 'Pinch', fingers: 'Front 2' })).toBeCloseTo(1.56);
    expect(h({ hands: 'LR' })).toBe(1.5);
    expect(h({ hands: 'L', fingers: 'Mono' })).toBe(2);                    // 2.25, capped
    expect(h({ mode: 'lift', hands: 'L' })).toBe(1);                       // a one-arm lift gets no bonus
    expect(pts({ grip: 'Sloper' })).toBeGreaterThan(pts({ grip: 'Open' }));
    expect(pts({ grip: 'Open' })).toBeGreaterThan(pts());
    expect(pts({ fingers: 'Front 2' })).toBeGreaterThan(pts({ fingers: 'Front 3' }));
  });

  it('one-arm hangs score more than two arms with the same load on each arm', () => {
    expect(intensity(L({ hands: 'LR', loadPct: 100 }))).toBe(2);
    expect(intensity(L({ hands: 'L', loadPct: 80 }))).toBe(1.6);
    // left + right at bodyweight vs two arms at +100% (the same load per arm): ×1.5 more
    const lr = sessionWork(logged({ hands: 'LR' }, log(4, 1, 10, 'LR'))), two = sessionWork(logged({ loadPct: 200 }, log(4, 1, 10)));
    expect(lr).toBeCloseTo(1.5 * two);
    expect(lr).toBeCloseTo(3 * sessionWork(logged({}, log(4, 1, 10)))); // three times a two-arm bodyweight hang
    // one hand only is half of left + right, and still well above two arms at bodyweight
    const one = pts({ hands: 'L' }, log(4, 1, 10, 'L'));
    expect(one).toBeGreaterThan(pts({}, log(4, 1, 10)));
    expect(one).toBeLessThan(pts({ hands: 'LR' }, log(4, 1, 10, 'LR')));
    // assisted one-arm scores less than full bodyweight one-arm
    expect(pts({ hands: 'L', loadPct: 57 }, log(4, 1, 10, 'L'))).toBeLessThan(one);
  });

  it('no-hang lifts score by weight lifted, per hand, whatever the hands setting', () => {
    expect(liftPct(70, 35)).toBe(100);
    expect(liftPct(70, 42)).toBe(120);
    expect(liftPct(null, 40)).toBeNull();
    expect(pts({ mode: 'lift', loadPct: liftPct(70, 45) })).toBeGreaterThan(pts({ mode: 'lift', loadPct: liftPct(70, 30) }));
    // a one-arm lift isn't doubled like a one-arm hang: 20kg in one hand is 20kg per hand
    expect(intensity(L({ mode: 'lift', hands: 'L', loadPct: liftPct(70, 20) }))).toBeCloseTo(0.57);
    // one-arm left + right lifting 20kg = two hands lifting 20kg each
    expect(pts({ mode: 'lift', hands: 'LR', loadPct: 57 }, log(5, 1, 10, 'LR'))).toBe(pts({ mode: 'lift', loadPct: 57 }));
    // a no-hang one-arm lift is worth far less than a bodyweight one-arm hang
    expect(pts({ mode: 'lift', hands: 'L', loadPct: liftPct(70, 20) }, log(5, 1, 10, 'L'))).toBeLessThan(pts({ hands: 'L' }, log(5, 1, 10, 'L')) - 20);
  });

  it('without a bodyweight, load comes from the kg entered (70kg assumed), never target effort', () => {
    expect(intensity(L({ assistKg: 35 }))).toBe(0.5);                       // heavy assist is no longer scored as bodyweight
    expect(intensity(L({ addedKg: 14 }))).toBe(1.2);
    expect(intensity(L({ mode: 'lift', liftKg: 35 }))).toBe(1);
    expect(intensity(L({ mode: 'lift', liftKg: 5 }))).toBe(0.14);          // a 5kg lift is a 5kg lift, whatever effort was picked
    expect(intensity(L({ mode: 'lift', liftKg: 0 }))).toBe(0.1);           // and a lift has no 40% floor: only what's lifted counts
    expect(intensity(L({ assistKg: 60 }))).toBe(0.4);                       // a hang still counts as at least 40%
    expect(pts({ mode: 'lift', loadPct: null, liftKg: 5, effortPct: 100 })).toBeLessThan(pts({ loadPct: null }) - 20);
    expect(pts({ hands: 'LR', loadPct: null, assistKg: 40 }, log(5, 1, 10, 'LR'))).toBeLessThan(pts({ hands: 'LR', loadPct: null }, log(5, 1, 10, 'LR')) - 30);
  });

  it('a day’s first 200 points count in full, then each extra point is worth less and less', () => {
    const at = (h: number) => new Date(Date.UTC(2026, 10, 18, h)).toISOString();
    const a = logged({ createdAt: at(0), loadPct: 120 }, repeaters(6)), b = logged({ createdAt: at(1), loadPct: 120 }, repeaters(6));
    const wa = sessionWork(a), wb = sessionWork(b);
    expect(wa).toBeGreaterThan(200 / 2); expect(wa).toBeLessThan(200);       // each one alone is under the 200
    expect(sessionPoints(a, [a, b])).toBe(Math.round(5 + wa));                // first of the day: all of it
    expect(sessionPoints(b, [a, b])).toBeLessThan(Math.round(wb));            // the second goes past 200
    expect(sessionPoints(b, [a, b])).toBeGreaterThan(Math.round(wb / 2));     // but still earns plenty
    // logging a mountain of volume in a day gets nowhere near its raw points
    const huge = logged({}, log(50, 30, 4));
    expect(sessionWork(huge)).toBeGreaterThan(2000);
    expect(sessionPoints(huge, [])).toBeLessThan(500);
  });

  it('splitting training into lots of little sessions earns nothing extra', () => {
    const one = pts({}, log(10, 1, 10));
    const ten = Array.from({ length: 10 }, (_, h) => logged({ createdAt: new Date(Date.UTC(2026, 10, 18, h)).toISOString() }, log(1, 1, 10)));
    const split = ten.reduce((a, s) => a + sessionPoints(s, ten), 0);
    expect(Math.abs(split - one)).toBeLessThanOrEqual(5); // the same apart from rounding each one
  });

  it('the show-up 5 and PB 10 count once a day; a new day starts fresh', () => {
    const a = logged({ createdAt: '2026-11-18T01:00:00.000Z', isPb: true }), b = logged({ createdAt: '2026-11-18T05:00:00.000Z', isPb: true });
    const c = logged({ createdAt: '2026-11-19T01:00:00.000Z', isPb: true });  // the next Sydney day
    expect(sessionPoints(a, [a, b, c])).toBe(78);
    expect(sessionPoints(b, [a, b, c])).toBe(63);                             // just its sets: 62.5
    expect(sessionPoints(c, [a, b, c])).toBe(78);                             // one earlier day isn't "regular" yet
    expect(scoringDay('2026-11-18T12:59:00.000Z')).toBe('2026-11-18');         // 23:59 Sydney
    expect(scoringDay('2026-11-18T13:00:00.000Z')).toBe('2026-11-19');         // midnight Sydney
  });

  it('training regularly: ×1.1 with real sessions on 2 or more of the 7 days before', () => {
    const day = (d: number, over: Partial<Session> = {}, hangs?: HangResult[]) => logged({ createdAt: `2026-11-${String(d).padStart(2, '0')}T01:00:00.000Z`, ...over }, hangs); // 12:00 Sydney
    const today = day(20);
    expect(sessionPoints(today, [today])).toBe(68);
    expect(sessionPoints(today, [day(19), day(17), today])).toBe(Math.round(5 + 62.5 * 1.1));   // 74
    expect(sessionPoints(today, [day(19), today])).toBe(68);                                      // only one day
    expect(sessionPoints(today, [day(19), { ...day(19), id: 'x2' }, today])).toBe(68);           // two on the same day are one day
    expect(sessionPoints(today, [day(19), day(13), today])).toBe(74);                             // 7 days before still counts
    expect(sessionPoints(today, [day(19), day(12), today])).toBe(68);                             // 8 days before doesn't
    expect(sessionPoints(today, [day(19), day(17, {}, log(1, 1, 10)), today])).toBe(68);          // a 10s session isn't real training
    expect(trainedRegularly('2026-11-20', [day(19), day(21), day(22)])).toBe(false);              // later days don't count
  });

  it('rescoreFrom re-scores the rest of the day and the week after, when a session is added or removed', () => {
    const a = logged({ userId: 'u', createdAt: '2026-11-18T01:00:00.000Z' }), b = logged({ userId: 'u', createdAt: '2026-11-18T05:00:00.000Z' });
    rescoreFrom([b, a], 'u', '2026-11-18');
    expect(a.points).toBe(68); expect(b.points).toBe(63);
    rescoreFrom([b], 'u', '2026-11-18');
    expect(b.points).toBe(68); // now the first session of the day
    // two earlier days make the next week "regular"; taking one away takes the bonus off
    const d1 = logged({ userId: 'u', createdAt: '2026-11-16T01:00:00.000Z' }), d2 = logged({ userId: 'u', createdAt: '2026-11-17T01:00:00.000Z' });
    const later = logged({ userId: 'u', createdAt: '2026-11-23T01:00:00.000Z' }), other = logged({ userId: 'v', createdAt: '2026-11-19T01:00:00.000Z', points: 1 });
    const all = [d1, d2, later, other];
    rescoreFrom(all, 'u', '2026-11-16');
    expect(later.points).toBe(74);
    expect(other.points).toBe(1); // someone else's are left alone
    rescoreFrom([d2, later, other], 'u', '2026-11-16');
    expect(later.points).toBe(68);
  });

  it('a session needs 15s under tension to earn the show-up points', () => {
    expect(pts({}, log(1, 1, 10))).toBe(13); // just its 12.5
  });

  it('edgeFactor clamps to 0.6–1.6 and smaller edges score more', () => {
    expect(edgeFactor(20)).toBe(1);
    expect(edgeFactor(5)).toBe(1.6);
    expect(edgeFactor(0)).toBe(1.6);
    expect(edgeFactor(50)).toBe(0.6);
    expect(edgeFactor(16)).toBe(1.25);
    expect(pts({ edgeMm: 14 })).toBeGreaterThan(pts({ edgeMm: 20 }));
  });

  it('Abrahangs and Warm-up count at most 40%, so a daily light session stays well below a hard one', () => {
    expect(intensity(L({ protocolKey: 'abra', loadPct: 100 }))).toBe(0.4);
    expect(intensity(L({ protocolKey: 'warm', loadPct: 120 }))).toBe(0.4);
    expect(intensity(L({ protocolKey: 'abra', mode: 'lift', loadPct: 30 }))).toBe(0.3);  // a light lift: what it lifts
    expect(intensity(L({ protocolKey: 'max', loadPct: 100 }))).toBe(1);                  // everything else untouched
    const abra = pts({ protocolKey: 'abra' }, log(10, 1, 10)), max = pts({ protocolKey: 'max' });
    expect(abra).toBe(55);                                                                 // 10 sets × 12.5 × 0.4, + 5
    expect(abra).toBeLessThan(max);                                                        // below Max Hangs at bodyweight
  });

  it('intensity clamps to 0.4–3', () => {
    expect(intensity(L({ loadPct: 350 }))).toBe(3);
    expect(intensity(L({ loadPct: 20 }))).toBe(0.4);
    expect(intensity(L({ loadPct: null }))).toBe(1);
    expect(sessionWork(logged({}, []))).toBe(0);
    expect(sessionWork(logged({}, log(1, 1, 10, 'both', -5)))).toBe(0);
  });

  it('what scores can be changed for 24 hours after a session, and never once its season is over', () => {
    const now = new Date('2026-11-23T10:00:00.000Z');
    expect(scoringLocked({ createdAt: '2026-11-22T11:00:00.000Z' }, now)).toBe(false); // 23 hours
    expect(scoringLocked({ createdAt: '2026-11-22T09:00:00.000Z' }, now)).toBe(true);  // 25 hours
    // 23:00 on 31 Aug in Sydney, looked at 7 hours later in the new season
    expect(scoringLocked({ createdAt: '2026-08-31T13:00:00.000Z' }, new Date('2026-08-31T20:00:00.000Z'))).toBe(true);
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

  it('strength boards compare two-arm hangs only', () => {
    expect(cat('added').value([session({ edgeMm: 20, addedKg: 20, hands: 'L' }), session({ edgeMm: 20, addedKg: 5 })], [], now)).toBe(5);
    expect(cat('loadpct').value([session({ loadPct: 100, hands: 'LR' })], [], now)).toBeNull();
  });

  it('one-arm board only counts hangs with no assist, never no-hang lifts', () => {
    const h = (hand: 'L' | 'R' | 'both', held: number) => ({ set: 1, rep: 1, hand, target: held, held, full: true });
    const ss = [
      session({ hands: 'L', hangs: [h('L', 8)] }),
      session({ hands: 'L', mode: 'lift', hangs: [h('L', 60)] }),   // no-hang lift
      session({ hands: 'R', assistKg: 30, hangs: [h('R', 40)] }),  // assisted
      session({ hangs: [h('both', 90)] }),                          // two-arm
    ];
    expect(cat('onearm').value(ss, ss, now)).toBe(8);
  });

  it('smallest edge needs a hang of 5s or more', () => {
    expect(cat('edge').value([session({ edgeMm: 6, hang: 3 }), session({ edgeMm: 15 })], [], now)).toBe(15);
  });

  it('sets only count when every hang in the set was held full time', () => {
    const h = (set: number, full: boolean, hand: 'L' | 'R' | 'both' = 'both') => ({ set, rep: 1, hand, target: 10, held: full ? 10 : 4, full });
    expect(completedSets(session({ hangs: [h(1, true), h(2, false), h(3, true)] }))).toBe(2);
    expect(completedSets(session({ hangs: [h(1, true, 'L'), h(1, false, 'R')] }))).toBe(0);
  });

  it('consistency counts training days, not sessions', () => {
    const ss = [sessionAt(2026, 11, 17, 9), sessionAt(2026, 11, 17, 10), sessionAt(2026, 11, 17, 11), sessionAt(2026, 11, 16, 9), sessionAt(2026, 11, 15, 9, { tutS: 3 })];
    expect(cat('consist').value(ss, ss, now)).toBe(2);
  });

  it('a streak week needs real sessions on 2 different days', () => {
    const sameDay = [0, 1, 2].flatMap(w => { const m = addDays(weekStart(now), -7 * w); return [sessionAt(m.getFullYear(), m.getMonth() + 1, m.getDate(), 9), sessionAt(m.getFullYear(), m.getMonth() + 1, m.getDate(), 10)]; });
    expect(weekStreak(sameDay, now)).toBe(0);
    const tiny = twoPerWeek(weekStart(now), [0, 1, 2]).map(s => ({ ...s, tutS: 2 }));
    expect(weekStreak(tiny, now)).toBe(0);
  });

  it('this week and this month add up points since Monday and since the 1st', () => {
    // now = Wed 18 Nov 2026; Monday was the 16th
    const ss = [sessionAt(2026, 11, 16, 9, { points: 40 }), sessionAt(2026, 11, 18, 9, { points: 25 }), sessionAt(2026, 11, 15, 20, { points: 60 }),
      sessionAt(2026, 11, 1, 8, { points: 10 }), sessionAt(2026, 10, 31, 20, { points: 99 })];
    expect(cat('week').value(ss, ss, now)).toBe(65);
    expect(cat('month').value(ss, ss, now)).toBe(135);
    expect(cat('week').value([sessionAt(2026, 11, 15, 20)], [], now)).toBeNull(); // nothing this week: off the board
  });

  it('all the points boards share one group, with Overall still the default board', () => {
    expect(CATEGORIES[0]!.id).toBe('overall');
    expect(CATEGORIES.filter(c => c.group === 'Points').map(c => c.id).sort()).toEqual(['month', 'overall', 'season', 'week']);
  });

  it('weekly streak category matches weekStreak', () => {
    const ss = twoPerWeek(weekStart(now), [1, 2, 3, 4, 5, 6]);
    expect(cat('streak').value(ss, ss, now)).toBe(6);
  });

  it('each grip board only counts its own grip', () => {
    const ss = [
      session({ grip: 'Open', loadPct: 130 }),
      session({ grip: 'Drag', loadPct: 115 }),
      session({ grip: 'Drag', loadPct: 125, hands: 'L' }),   // one-arm: not on the two-arm boards
      session({ grip: 'Half crimp', loadPct: 140 }),
      session({ grip: 'Pinch', loadPct: 95 }),
      session({ grip: 'Sloper', loadPct: 105 }),
      session({ grip: 'Sloper', loadPct: 150, mode: 'lift' }), // no-hang lifts aren't on the hang boards
    ];
    expect(cat('drag').value(ss, ss, now)).toBe(115);
    expect(cat('pinch').value(ss, ss, now)).toBe(95);
    expect(cat('sloper').value(ss, ss, now)).toBe(105);
    expect(cat('openh').value(ss, ss, now)).toBe(130);
    expect(cat('half').value(ss, ss, now)).toBe(140);
    expect(cat('drag').value([session({ grip: 'Open' })], [], now)).toBeNull();
    expect(CATEGORIES.filter(c => c.group === 'Grip type').map(c => c.id)).toEqual(['half', 'fullc', 'openh', 'drag', 'pinch', 'sloper']);
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
