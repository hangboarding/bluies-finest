// Group challenges: a shared goal for a date range (e.g. "500 hangs as a group this month").
// Admins set them from Admin tools; if none is running, an automatic monthly one is used.
import type { Session } from './types';
import { tzParts, tzMidnight } from './seasons';

export type Metric = 'hangs' | 'sessions' | 'minutes' | 'pbs' | 'climbers';
export interface Challenge { id: string; title: string; metric: Metric; target: number; startsOn: string; endsOn: string; auto?: boolean; }

export const METRICS: Record<Metric, { label: string; unit: string; icon: string }> = {
  hangs: { label: 'Hangs', unit: 'hangs', icon: 'mountain' },
  sessions: { label: 'Sessions', unit: 'sessions', icon: 'calendar' },
  minutes: { label: 'Minutes on the board', unit: 'min', icon: 'hang' },
  pbs: { label: 'Personal bests', unit: 'PBs', icon: 'medal' },
  climbers: { label: 'Climbers who trained', unit: 'climbers', icon: 'users' },
};

const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const parse = (s: string) => s.split('-').map(Number) as [number, number, number];
/** Challenge dates are whole days in the group's timezone; endsOn is inclusive. */
export const rangeOf = (c: Pick<Challenge, 'startsOn' | 'endsOn'>) => {
  const [y1, m1, d1] = parse(c.startsOn), [y2, m2, d2] = parse(c.endsOn);
  return { start: tzMidnight(y1, m1, d1), end: tzMidnight(...nextDay(y2, m2, d2)) };
};
function nextDay(y: number, m: number, d: number): [number, number, number] { const t = new Date(Date.UTC(y, m - 1, d + 1)); return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()]; }
export const todayISO = (now = new Date()) => { const p = tzParts(now); return ymd(p.y, p.m, p.d); };

export function inRange(s: Session, c: Challenge) { const { start, end } = rangeOf(c), t = +new Date(s.createdAt); return t >= +start && t < +end; }

/** Progress for each climber and the group total. */
export function progress(c: Challenge, sessions: Session[]) {
  const { start, end } = rangeOf(c), a = +start, b = +end; // once, not per session
  const xs = sessions.filter(s => { if (s.pendingUpload) return false; const t = +new Date(s.createdAt); return t >= a && t < b; });
  const per = new Map<string, number>();
  const add = (u: string, v: number) => per.set(u, (per.get(u) ?? 0) + v);
  for (const s of xs) {
    if (c.metric === 'hangs') add(s.userId, s.totalHangs);
    else if (c.metric === 'sessions') add(s.userId, 1);
    else if (c.metric === 'minutes') add(s.userId, s.tutS / 60);
    else if (c.metric === 'pbs') { if (s.isPb) add(s.userId, 1); }
    else if (c.metric === 'climbers') per.set(s.userId, 1);
  }
  const total = Math.floor([...per.values()].reduce((a, b) => a + b, 0));
  const top = [...per.entries()].map(([userId, v]) => ({ userId, v: Math.round(v) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
  return { total, pct: Math.min(100, Math.round((total / c.target) * 100)), done: total >= c.target, top };
}

/** The admin-set challenge running today, or an automatic monthly hangs challenge. */
export function activeChallenge(list: Challenge[], sessions: Session[], now = new Date()): Challenge {
  const today = todayISO(now);
  const live = list.filter(c => c.startsOn <= today && c.endsOn >= today).sort((a, b) => b.startsOn.localeCompare(a.startsOn))[0];
  if (live) return live;
  const p = tzParts(now), lastDay = new Date(Date.UTC(p.y, p.m, 0)).getUTCDate();
  // target: 10% more than last month's group hangs, rounded to 50, at least 100
  const prevY = p.m === 1 ? p.y - 1 : p.y, prevM = p.m === 1 ? 12 : p.m - 1, prevLast = new Date(Date.UTC(prevY, prevM, 0)).getUTCDate();
  const last = progress({ id: '', title: '', metric: 'hangs', target: 1, startsOn: ymd(prevY, prevM, 1), endsOn: ymd(prevY, prevM, prevLast) }, sessions).total;
  const target = Math.max(100, Math.round((last * 1.1) / 50) * 50);
  const month = new Date(Date.UTC(p.y, p.m - 1, 15)).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });
  return { id: `auto-${p.y}-${p.m}`, title: `${target.toLocaleString('en-AU')} hangs in ${month}`, metric: 'hangs', target, startsOn: ymd(p.y, p.m, 1), endsOn: ymd(p.y, p.m, lastDay), auto: true };
}

/** Whole days left after today, in the group's timezone (0 = today is the last day). */
export const daysLeftIn = (c: Challenge, now = new Date()) => {
  const [y1, m1, d1] = parse(todayISO(now)), [y2, m2, d2] = parse(c.endsOn);
  return Math.max(0, Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5));
};
