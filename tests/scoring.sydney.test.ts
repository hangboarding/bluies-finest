// Runs in the "sydney" vitest project (TZ=Australia/Sydney).
// 2026: AEDT ends Sun 5 Apr 03:00 -> 02:00; AEDT starts Sun 4 Oct 02:00 -> 03:00.
import { describe, it, expect } from 'vitest';
import { weekStart, addDays, weekStreak, bestDayRun, dayKey, parseDayKey } from '../src/lib/scoring';
import { sessionAt } from './helpers';

const H = 3600e3;

describe('scoring in Australia/Sydney', () => {
  it('weekStart is local Monday midnight on both sides of the October change', () => {
    const before = weekStart(new Date(2026, 9, 4, 12)); // Sun 4 Oct (change day)
    const after = weekStart(new Date(2026, 9, 5, 0, 30)); // Mon 5 Oct
    expect(dayKey(before)).toBe('2026-09-28');
    expect(dayKey(after)).toBe('2026-10-05');
    expect(after.getHours()).toBe(0);
    expect(+after - +before).toBe(7 * 24 * H - H); // spring forward: 167h week
  });

  it('weekStart is local Monday midnight across the April change', () => {
    const before = weekStart(new Date(2026, 3, 5, 12));
    const after = weekStart(new Date(2026, 3, 8));
    expect(dayKey(before)).toBe('2026-03-30');
    expect(dayKey(after)).toBe('2026-04-06');
    expect(+after - +before).toBe(7 * 24 * H + H);
  });

  it('weekStreak counts across the October and April changes', () => {
    const mk = (now: Date, weeks: number) => {
      const mon = weekStart(now);
      return Array.from({ length: weeks }, (_, w) => addDays(mon, -7 * w)).flatMap(m => [
        sessionAt(m.getFullYear(), m.getMonth() + 1, m.getDate(), 0),
        sessionAt(m.getFullYear(), m.getMonth() + 1, m.getDate() + 3, 21),
      ]);
    };
    const oct = new Date(2026, 9, 28, 12);
    expect(weekStreak(mk(oct, 9), oct)).toBe(9);
    const apr = new Date(2026, 4, 6, 12);
    expect(weekStreak(mk(apr, 9), apr)).toBe(9);
  });

  it('bestDayRun and parseDayKey across the October change', () => {
    expect(bestDayRun(new Set(['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']))).toBe(4);
    expect(parseDayKey('2026-10-04').getHours()).toBe(0);
    expect(dayKey(addDays(parseDayKey('2026-10-03'), 1))).toBe('2026-10-04');
  });
});
