// Seasons follow southern-hemisphere meteorological seasons in Blue Mountains time:
// Summer Dec–Feb, Autumn Mar–May, Winter Jun–Aug, Spring Sep–Nov.
// The SQL function public.season_champions() uses exactly the same rules.
import type { Session } from './types';

export const SEASON_TZ = 'Australia/Sydney';
const NAMES: Record<number, string> = { 12: 'Summer', 3: 'Autumn', 6: 'Winter', 9: 'Spring' };

export interface Season { key: string; name: string; start: Date; end: Date; startMonth: number; year: number; }

/** Calendar year/month/day in the season timezone. */
const FMTS = new Map<string, Intl.DateTimeFormat>(); // building a formatter is slow; reuse one per zone
export function tzParts(d: Date, tz = SEASON_TZ) {
  let f = FMTS.get(tz);
  if (!f) FMTS.set(tz, f = new Intl.DateTimeFormat('en-AU', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }));
  const p = f.formatToParts(d);
  const g = (t: string) => +p.find(x => x.type === t)!.value;
  return { y: g('year'), m: g('month'), d: g('day'), h: g('hour'), min: g('minute'), s: g('second') };
}

/** The instant of local midnight on y-m-d in the season timezone (handles daylight saving). */
export function tzMidnight(y: number, m: number, d: number, tz = SEASON_TZ): Date {
  let t = Date.UTC(y, m - 1, d);
  for (let i = 0; i < 3; i++) { // converge on the zone's offset at that moment
    const p = tzParts(new Date(t), tz), asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
    t += Date.UTC(y, m - 1, d) - asUtc;
  }
  return new Date(t);
}

/** Season start month (12, 3, 6 or 9) and the year that month falls in. */
function seasonStartYM(y: number, m: number) {
  if (m === 1 || m === 2) return { y: y - 1, m: 12 };
  return { y, m: m - (m % 3) };
}

const SEASONS = new Map<string, Season>();
export function seasonFromStart(y: number, m: number): Season {
  const k = `${y}-${m}`, hit = SEASONS.get(k); if (hit) return hit;
  const s = buildSeason(y, m); SEASONS.set(k, s); return s;
}
function buildSeason(y: number, m: number): Season {
  const next = m === 12 ? { y: y + 1, m: 3 } : { y, m: m + 3 };
  const name = m === 12 ? `Summer ${y}/${String(y + 1).slice(2)}` : `${NAMES[m]} ${y}`;
  return { key: `${y}-${String(m).padStart(2, '0')}`, name, start: tzMidnight(y, m, 1), end: tzMidnight(next.y, next.m, 1), startMonth: m, year: y };
}

export function seasonOf(d: Date): Season {
  const p = tzParts(d), s = seasonStartYM(p.y, p.m);
  return seasonFromStart(s.y, s.m);
}
export const previousSeason = (s: Season) => seasonOf(new Date(+s.start - 864e5));
/** Whole days after today until the season's last day, in Blue Mountains time (0 = last day). */
export const daysLeft = (s: Season, now = new Date()) => {
  const a = tzParts(now), b = tzParts(new Date(+s.end - 1));
  return Math.max(0, Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 864e5));
};
export const inSeason = (s: Session, season: Season) => { const t = +new Date(s.createdAt); return t >= +season.start && t < +season.end; };

/** Points per climber in a season, highest first. */
export function seasonStandings(sessions: Session[], season: Season) {
  const m = new Map<string, number>();
  for (const s of sessions) if (inSeason(s, season) && !s.pendingUpload) m.set(s.userId, (m.get(s.userId) ?? 0) + s.points);
  return [...m.entries()].map(([userId, points]) => ({ userId, points: Math.round(points) })).sort((a, b) => b.points - a.points);
}

export interface Champion { seasonStart: string; userId: string; points: number; }
/** Winners (ties share the title) of every completed season in the given sessions. */
export function championsFrom(sessions: Session[], now = new Date()): Champion[] {
  const current = seasonOf(now).key, by = new Map<string, Map<string, number>>();
  for (const s of sessions) {
    if (s.pendingUpload) continue;
    const k = seasonOf(new Date(s.createdAt)).key; if (k === current) continue;
    const m = by.get(k) ?? by.set(k, new Map()).get(k)!; m.set(s.userId, (m.get(s.userId) ?? 0) + s.points);
  }
  const out: Champion[] = [];
  for (const [k, m] of by) {
    const top = Math.max(...m.values());
    for (const [userId, pts] of m) if (pts === top) out.push({ seasonStart: `${k}-01`, userId, points: Math.round(pts) });
  }
  return out.sort((a, b) => b.seasonStart.localeCompare(a.seasonStart));
}
export const seasonNameFromStart = (iso: string) => { const [y, m] = iso.split('-').map(Number); return seasonFromStart(y!, m!).name; };
