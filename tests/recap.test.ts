import { describe, it, expect } from 'vitest';
import { weeklyRecap } from '../src/lib/recap';
import { sessionAt } from './helpers';

// "now" = Wednesday 25 Nov 2026 → last full week is Mon 16 – Sun 22 Nov.
const NOW = new Date(2026, 10, 25, 12);

describe('weeklyRecap', () => {
  it('summarises only last Monday–Sunday', () => {
    const xs = [
      sessionAt(2026, 11, 15, 20, { userId: 'a' }),                 // Sun before → excluded
      sessionAt(2026, 11, 16, 0, { userId: 'a', tutS: 60, points: 10 }),  // Mon 00:00 → included
      sessionAt(2026, 11, 18, 9, { userId: 'b', tutS: 120, points: 40, isPb: true }),
      sessionAt(2026, 11, 20, 9, { userId: 'b', tutS: 60, points: 30, isPb: true }),
      sessionAt(2026, 11, 22, 23, { userId: 'a', tutS: 30, points: 5, isPb: true }), // Sun late → included
      sessionAt(2026, 11, 23, 8, { userId: 'c' }),                  // this week
      sessionAt(2026, 11, 24, 8, { userId: 'c' }),                  // this week
    ];
    const r = weeklyRecap(xs, NOW);
    expect(r.sessions).toBe(4);
    expect(r.tutS).toBe(270);
    expect(r.climbers).toBe(2);
    expect(r.pbs).toEqual([{ userId: 'b', count: 2 }, { userId: 'a', count: 1 }]);
    expect(r.mostActive?.count).toBe(2);
    expect(r.topPoints).toEqual({ userId: 'b', points: 70 });
    expect(r.thisWeek).toBe(2);
    expect(r.from.getDate()).toBe(16);
    expect(r.to.getDate()).toBe(22);
  });

  it('handles an empty week', () => {
    const r = weeklyRecap([sessionAt(2026, 11, 24, 8)], NOW);
    expect(r.sessions).toBe(0);
    expect(r.mostActive).toBeNull();
    expect(r.topPoints).toBeNull();
    expect(r.thisWeek).toBe(1);
  });

  it('ignores sessions still waiting to upload', () => {
    const r = weeklyRecap([sessionAt(2026, 11, 18, 9, { pendingUpload: true })], NOW);
    expect(r.sessions).toBe(0);
  });

  it('uses calendar weeks across the October clock change', () => {
    // now = Wed 28 Oct 2026 (GMT) → last week Mon 19 Oct (BST) – Sun 25 Oct (clocks go back that night)
    const r = weeklyRecap([sessionAt(2026, 10, 19, 0), sessionAt(2026, 10, 25, 23)], new Date(2026, 9, 28, 12));
    expect(r.sessions).toBe(2);
    expect(r.from.getDate()).toBe(19);
  });
});
