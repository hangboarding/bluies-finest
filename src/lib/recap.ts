// Weekly crew recap for the Activity feed: last full week (Monday–Sunday) plus this week so far.
import type { Session } from './types';
import { weekStart, addDays } from './scoring';

export interface Recap {
  from: Date; to: Date;                 // last full week
  sessions: number; tutS: number; climbers: number;
  pbs: { userId: string; count: number }[];          // most PBs first
  mostActive: { userId: string; count: number } | null;
  topPoints: { userId: string; points: number } | null;
  thisWeek: number;                     // sessions so far this week
}

export function weeklyRecap(all: Session[], now = new Date()): Recap {
  const thisMon = weekStart(now), lastMon = addDays(thisMon, -7);
  const inLast = all.filter(s => { const t = new Date(s.createdAt); return t >= lastMon && t < thisMon && !s.pendingUpload; });
  const tally = <K extends string>(xs: Session[], f: (s: Session) => number) => {
    const m = new Map<string, number>(); for (const s of xs) m.set(s.userId, (m.get(s.userId) ?? 0) + f(s));
    return [...m.entries()].map(([userId, v]) => ({ userId, v })).sort((a, b) => b.v - a.v);
  };
  const counts = tally(inLast, () => 1), pts = tally(inLast, s => s.points), pbs = tally(inLast.filter(s => s.isPb), () => 1);
  return {
    from: lastMon, to: addDays(thisMon, -1),
    sessions: inLast.length, tutS: inLast.reduce((a, s) => a + s.tutS, 0), climbers: counts.length,
    pbs: pbs.map(x => ({ userId: x.userId, count: x.v })),
    mostActive: counts[0] ? { userId: counts[0].userId, count: counts[0].v } : null,
    topPoints: pts[0] ? { userId: pts[0].userId, points: Math.round(pts[0].v) } : null,
    thisWeek: all.filter(s => new Date(s.createdAt) >= thisMon).length,
  };
}
