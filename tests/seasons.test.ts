import { describe, it, expect } from 'vitest';
import { seasonOf, previousSeason, daysLeft, seasonStandings, championsFrom, seasonNameFromStart, tzMidnight } from '../src/lib/seasons';
import { activeChallenge, progress, rangeOf, todayISO, type Challenge } from '../src/lib/challenges';
import { CATEGORIES } from '../src/lib/scoring';
import { session } from './helpers';

const at = (iso: string, over = {}) => session({ createdAt: iso, ...over });

describe('seasons (Blue Mountains time, southern hemisphere)', () => {
  it('names and bounds each season', () => {
    expect(seasonOf(new Date('2026-11-21T20:00:00Z')).name).toBe('Spring 2026');
    expect(seasonOf(new Date('2026-01-15T00:00:00Z')).name).toBe('Summer 2025/26');
    expect(seasonOf(new Date('2026-04-10T00:00:00Z')).name).toBe('Autumn 2026');
    expect(seasonOf(new Date('2026-07-10T00:00:00Z')).name).toBe('Winter 2026');
  });
  it('changes at local midnight, across daylight saving', () => {
    // 1 Dec 2026 00:00 AEDT = 30 Nov 13:00 UTC
    expect(seasonOf(new Date('2026-11-30T12:59:00Z')).name).toBe('Spring 2026');
    expect(seasonOf(new Date('2026-11-30T13:00:00Z')).name).toBe('Summer 2026/27');
    // 1 Sep 2026 00:00 AEST (no daylight saving) = 31 Aug 14:00 UTC
    expect(tzMidnight(2026, 9, 1).toISOString()).toBe('2026-08-31T14:00:00.000Z');
    expect(seasonOf(new Date('2026-08-31T13:59:00Z')).name).toBe('Winter 2026');
  });
  it('previous season and days left', () => {
    const s = seasonOf(new Date('2026-11-21T20:00:00Z'));
    expect(previousSeason(s).name).toBe('Winter 2026');
    expect(daysLeft(s, new Date('2026-11-21T20:00:00Z'))).toBe(8); // 22 Nov → 30 Nov
    expect(daysLeft(s, new Date('2026-11-30T05:00:00Z'))).toBe(0); // last day
    expect(seasonNameFromStart('2026-12-01')).toBe('Summer 2026/27');
  });
  it('standings and champions (ties share, current season excluded)', () => {
    const xs = [
      at('2026-07-01T00:00:00Z', { userId: 'a', points: 100 }), at('2026-07-02T00:00:00Z', { userId: 'b', points: 60 }),
      at('2026-07-03T00:00:00Z', { userId: 'b', points: 40 }),                       // Winter: a & b tie on 100
      at('2026-10-01T00:00:00Z', { userId: 'c', points: 500 }),                      // Spring (current)
    ];
    const now = new Date('2026-11-21T20:00:00Z');
    expect(seasonStandings(xs, seasonOf(now))).toEqual([{ userId: 'c', points: 500 }]);
    const champs = championsFrom(xs, now);
    expect(champs.map(c => c.userId).sort()).toEqual(['a', 'b']);
    expect(champs.every(c => c.seasonStart === '2026-06-01' && c.points === 100)).toBe(true);
  });
  it('"This season" leaderboard category only counts the current season', () => {
    const cat = CATEGORIES.find(c => c.id === 'season')!, now = new Date('2026-11-21T20:00:00Z');
    expect(cat.value([at('2026-08-01T00:00:00Z', { points: 99 })], [], now)).toBeNull();
    expect(cat.value([at('2026-09-05T00:00:00Z', { points: 30 }), at('2026-11-20T00:00:00Z', { points: 12 })], [], now)).toBe(42);
  });
});

describe('crew challenges', () => {
  const c: Challenge = { id: 'x', title: 't', metric: 'hangs', target: 10, startsOn: '2026-11-01', endsOn: '2026-11-30' };
  it('date range is whole local days, end inclusive', () => {
    const r = rangeOf(c);
    expect(r.start.toISOString()).toBe('2026-10-31T13:00:00.000Z'); // 1 Nov 00:00 AEDT
    expect(r.end.toISOString()).toBe('2026-11-30T13:00:00.000Z');   // 1 Dec 00:00 AEDT
  });
  it('counts each metric', () => {
    const xs = [
      at('2026-11-05T00:00:00Z', { userId: 'a', totalHangs: 6, fullHangs: 6, tutS: 120, isPb: true }),
      at('2026-11-06T00:00:00Z', { userId: 'b', totalHangs: 5, tutS: 60 }),
      at('2026-10-30T00:00:00Z', { userId: 'b', totalHangs: 99 }),                      // before start
      at('2026-11-07T00:00:00Z', { userId: 'b', totalHangs: 50, pendingUpload: true }), // not uploaded yet
    ];
    const p = progress(c, xs);
    expect(p.total).toBe(11); expect(p.done).toBe(true); expect(p.pct).toBe(100);
    expect(p.top[0]).toEqual({ userId: 'a', v: 6 });
    expect(progress({ ...c, metric: 'sessions' }, xs).total).toBe(2);
    expect(progress({ ...c, metric: 'minutes' }, xs).total).toBe(3);
    expect(progress({ ...c, metric: 'pbs' }, xs).total).toBe(1);
    expect(progress({ ...c, metric: 'climbers' }, xs).total).toBe(2);
  });
  it('picks the running admin challenge, else an automatic monthly one', () => {
    const now = new Date('2026-11-21T20:00:00Z');
    expect(activeChallenge([c], [], now).id).toBe('x');
    const auto = activeChallenge([{ ...c, startsOn: '2026-10-01', endsOn: '2026-10-31' }], [], now);
    expect(auto.auto).toBe(true);
    expect(auto.startsOn).toBe('2026-11-01'); expect(auto.endsOn).toBe('2026-11-30');
    expect(auto.target).toBe(100); // minimum
    // 10% more than last month's hangs, rounded to 50
    const oct = Array.from({ length: 10 }, (_, i) => at(`2026-10-${String(i + 5).padStart(2, '0')}T00:00:00Z`, { totalHangs: 50, fullHangs: 50 }));
    expect(activeChallenge([], oct, now).target).toBe(550);
    expect(todayISO(now)).toBe('2026-11-22'); // already Sunday in the Blue Mountains
  });
});

describe('challenge days left', () => {
  it('counts calendar days in the crew timezone', async () => {
    const { daysLeftIn } = await import('../src/lib/challenges');
    const c = { id: 'x', title: '', metric: 'hangs' as const, target: 1, startsOn: '2026-11-16', endsOn: '2026-11-22' };
    expect(daysLeftIn(c, new Date('2026-11-21T20:00:00Z'))).toBe(0); // 22 Nov in Sydney = last day
    expect(daysLeftIn({ ...c, endsOn: '2026-11-30' }, new Date('2026-11-21T20:00:00Z'))).toBe(8);
  });
});
