// Points + leaderboard maths. Kept deliberately simple and explainable.
//
// Session points = 5 for showing up
//               + time under tension × load factor × edge factor ÷ 2
//               + 2 per hang held for its full time
//               + 20 if the session set a personal best
// Load factor  = load as % of bodyweight ÷ 100 (no-hang: target effort ÷ 100), clamped 0.4–2
// Edge factor  = 20mm ÷ edge size, clamped 0.6–1.6 (smaller edges score more)
// Overall rank = points over the last 28 days + 15 per week of current weekly streak.
import type { Session } from './types';

export function loadFactor(s: Pick<Session, 'mode' | 'loadPct' | 'effortPct'>) {
  const raw = s.mode === 'lift' ? (s.effortPct || 60) / 100 : (s.loadPct ?? 100) / 100;
  return Math.min(2, Math.max(0.4, raw));
}
export const edgeFactor = (mm: number) => Math.min(1.6, Math.max(0.6, 20 / Math.max(1, mm)));

export function sessionPoints(s: Pick<Session, 'tutS' | 'fullHangs' | 'isPb' | 'mode' | 'loadPct' | 'effortPct' | 'edgeMm'>) {
  return Math.round(5 + (s.tutS * loadFactor(s) * edgeFactor(s.edgeMm)) / 2 + 2 * s.fullHangs + (s.isPb ? 20 : 0));
}

export const loadPct = (bw: number | null, add: number, assist: number) =>
  bw && bw > 0 ? Math.round(((bw + add - assist) / bw) * 100) : null; // whole % only — finer values would reveal bodyweight

/** Monday 00:00 (local time) of the week containing d. */
export function weekStart(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
/** Add whole calendar days in local time. Unlike adding 864e5 ms, this is correct across daylight-saving changes. */
export function addDays(d: Date | number, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
/** Parse a "YYYY-MM-DD" day key as local midnight (new Date('YYYY-MM-DD') would be UTC). */
export function parseDayKey(k: string) { const [y, m, d] = k.split('-').map(Number); return new Date(y!, m! - 1, d!); }

/** Consecutive weeks (ending this week or last) with at least 2 sessions. */
export function weekStreak(sessions: Session[], now = new Date()) {
  const counts = new Map<number, number>();
  for (const s of sessions) { const w = +weekStart(new Date(s.createdAt)); counts.set(w, (counts.get(w) ?? 0) + 1); }
  let w = weekStart(now), n = 0;
  if ((counts.get(+w) ?? 0) < 2) w = addDays(w, -7); // this week isn't over yet — don't break the streak
  while ((counts.get(+w) ?? 0) >= 2) { n++; w = addDays(w, -7); }
  return n;
}

/** Longest run of consecutive calendar days with a session. */
export function bestDayRun(days: Set<string>) {
  let best = 0;
  for (const d of days) {
    const prev = addDays(parseDayKey(d), -1);
    if (days.has(dayKey(prev))) continue;
    let n = 1; const x = parseDayKey(d);
    for (;;) { x.setDate(x.getDate() + 1); if (days.has(dayKey(x))) n++; else break; }
    best = Math.max(best, n);
  }
  return best;
}
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const isCrimp = (g: string) => /crimp/i.test(g);
export const maxBy = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((m, x) => Math.max(m, f(x)), -Infinity);

// ---------- leaderboard categories ----------
export interface Category { id: string; icon: string; name: string; desc: string; unit: string; lower?: boolean; group: string;
  value: (mine: Session[], all: Session[], now: Date) => number | null; }
const days = (n: number, now: Date) => +now - n * 864e5;
const recent = (xs: Session[], n: number, now: Date) => xs.filter(s => +new Date(s.createdAt) >= days(n, now));
const maxHang = (xs: Session[]) => xs.filter(s => s.mode === 'hang' && s.hang <= 15 && s.fullHangs > 0);

export const CATEGORIES: Category[] = [
  { id: 'overall', icon: 'award', name: 'Overall', group: 'Overall', unit: 'pts', desc: 'Points over the last 28 days + streak bonus',
    value: (m, _a, now) => recent(m, 28, now).reduce((a, s) => a + s.points, 0) + 15 * weekStreak(m, now) },
  { id: 'loadpct', icon: 'bolt', name: '% Bodyweight', group: 'Strength', unit: '%', desc: 'Best load on a ≤15s hang, as % of bodyweight',
    value: m => { const v = maxBy(maxHang(m).filter(s => s.loadPct != null), s => s.loadPct!); return isFinite(v) ? v : null; } },
  { id: 'added', icon: 'add', name: 'Added weight', group: 'Strength', unit: 'kg', desc: 'Heaviest added weight on a ≤15s hang, 18–22mm edge',
    value: m => { const v = maxBy(maxHang(m).filter(s => s.edgeMm >= 18 && s.edgeMm <= 22), s => s.addedKg - s.assistKg); return isFinite(v) ? v : null; } },
  { id: 'edge', icon: 'edge', name: 'Smallest edge', group: 'Strength', unit: 'mm', lower: true, desc: 'Smallest edge held full time at bodyweight or more',
    value: m => { const xs = m.filter(s => s.mode === 'hang' && s.assistKg === 0 && s.fullHangs > 0); return xs.length ? Math.min(...xs.map(s => s.edgeMm)) : null; } },
  { id: 'onearm', icon: 'pointer', name: 'One-arm', group: 'Strength', unit: 's', desc: 'Longest single one-arm hang',
    value: m => { const v = maxBy(m.flatMap(s => s.hangs.filter(h => h.hand !== 'both')), h => h.held); return isFinite(v) ? v : null; } },
  { id: 'lift', icon: 'lift', name: 'No-hang lift', group: 'Strength', unit: 'kg', desc: 'Heaviest no-hang lift',
    value: m => { const v = maxBy(m.filter(s => s.mode === 'lift'), s => s.liftKg); return isFinite(v) ? v : null; } },
  { id: 'half', icon: 'half', name: 'Half crimp', group: 'Grip type', unit: '%', desc: 'Best half-crimp load as % of bodyweight',
    value: m => { const v = maxBy(maxHang(m).filter(s => s.grip === 'Half crimp' && s.loadPct != null), s => s.loadPct!); return isFinite(v) ? v : null; } },
  { id: 'fullc', icon: 'full', name: 'Full crimp', group: 'Grip type', unit: '%', desc: 'Best full-crimp load as % of bodyweight',
    value: m => { const v = maxBy(maxHang(m).filter(s => s.grip === 'Full crimp' && s.loadPct != null), s => s.loadPct!); return isFinite(v) ? v : null; } },
  { id: 'openh', icon: 'open', name: 'Open hand', group: 'Grip type', unit: '%', desc: 'Best open-hand load as % of bodyweight',
    value: m => { const v = maxBy(maxHang(m).filter(s => s.grip === 'Open' && s.loadPct != null), s => s.loadPct!); return isFinite(v) ? v : null; } },
  { id: 'tut', icon: 'hang', name: 'Hang time', group: 'Volume', unit: 's', desc: 'Time under tension, last 28 days',
    value: (m, _a, now) => recent(m, 28, now).reduce((a, s) => a + s.tutS, 0) },
  { id: 'sets', icon: 'sets', name: 'Sets', group: 'Volume', unit: '', desc: 'Sets completed, last 28 days',
    value: (m, _a, now) => recent(m, 28, now).reduce((a, s) => a + s.sets, 0) },
  { id: 'hangs', icon: 'mountain', name: 'Total hangs', group: 'Volume', unit: '', desc: 'Hangs logged in the last 90 days',
    value: m => m.reduce((a, s) => a + s.totalHangs, 0) },
  { id: 'streak', icon: 'streak', name: 'Weekly streak', group: 'Consistency', unit: 'wks', desc: 'Consecutive weeks with 2+ sessions',
    value: (m, _a, now) => weekStreak(m, now) },
  { id: 'consist', icon: 'calendar', name: 'Consistency', group: 'Consistency', unit: '', desc: 'Sessions in the last 30 days',
    value: (m, _a, now) => recent(m, 30, now).length },
  { id: 'improved', icon: 'chart', name: 'Most improved', group: 'Consistency', unit: '%', desc: 'Best load %BW this month vs the month before',
    value: (m, _a, now) => {
      const a = maxBy(maxHang(recent(m, 30, now)).filter(s => s.loadPct != null), s => s.loadPct!);
      const b = maxBy(maxHang(m.filter(s => { const t = +new Date(s.createdAt); return t < days(30, now) && t >= days(60, now); })).filter(s => s.loadPct != null), s => s.loadPct!);
      return isFinite(a) && isFinite(b) && b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : null;
    } },
];
