// Points + leaderboard maths. Kept deliberately simple and explainable.
// The database (the fair-scoring section of supabase/schema.sql) uses exactly the same rules; this copy is for the
// done screen, the edit sheet and demo mode.
//
// Intensity  = two-arm-equivalent load as a fraction of bodyweight, always worked out from
//              the kg entered: bodyweight on two arms = 1.0, +20% added = 1.2, one arm = ×2.
//              No-hang lifts use the weight lifted per hand × 2 ÷ bodyweight. Capped at 3. A hang counts
//              as at least 0.4; a lift counts only what it lifts (at least 0.1, the floor of liftPct).
//              With no bodyweight set, a 70kg climber is assumed (target effort % never counts).
//              Abrahangs and Warm-up are light by design (feet on or assisted, which people rarely
//              enter as assist), so they count at most 60%.
// Work       = time under tension × intensity² × edge factor, per arm: a one-arm hang's time
//              counts half, so left + right at bodyweight = one two-arm hang at +100% (the
//              same load on each arm), and one hand only is half of that.
// Edge factor = 20mm ÷ edge size, clamped 0.6–1.6 (smaller edges score more)
// Points are scored per day (Sydney time), so splitting training into lots of little
// sessions never earns more than doing it in one:
//   day work points = 40 × ln(1 + day's total work ÷ 40)   (more work always scores more,
//                     with diminishing returns, so piling on easy volume pays less and less)
//   each session gets the work points it adds to its day, × (1 + 0.25 × share of hangs held
//   full time), + 5 for the day's first real session (15s+ under tension),
//   + 10 for the day's first personal best.
// Overall rank = points over the last 28 days + 15 per week of current weekly streak.
import type { Session } from './types';
import { seasonOf, inSeason, tzParts } from './seasons';

/** Assumed bodyweight when a climber hasn't set theirs. */
export const DEFAULT_BW = 70;
/** A session needs this much time under tension to count as real training: streaks, the show-up points,
 *  the Consistency board, the Training days badges and crew-challenge session counts. */
export const MIN_TUT = 15;

type Load = Pick<Session, 'mode' | 'loadPct' | 'hands' | 'addedKg' | 'assistKg' | 'liftKg'> & { protocolKey?: string };
/** Protocols done light by design, and the most they can count for. */
export const LIGHT_PROTOCOLS = new Set(['abra', 'warm']), LIGHT_CAP = 0.6;
type Scored = Load & Pick<Session, 'tutS' | 'fullHangs' | 'totalHangs' | 'isPb' | 'edgeMm' | 'createdAt'> & { id?: string };

/** Two-arm-equivalent load ÷ bodyweight. */
export function intensity(s: Load) {
  const pct = s.loadPct ?? (s.mode === 'lift' ? liftPct(DEFAULT_BW, s.liftKg) : loadPct(DEFAULT_BW, s.addedKg, s.assistKg))!;
  const raw = (pct / 100) * (s.mode === 'hang' && s.hands !== 'both' ? 2 : 1); // lifts are already per hand × 2
  return Math.min(LIGHT_PROTOCOLS.has(s.protocolKey ?? '') ? LIGHT_CAP : 3, Math.max(s.mode === 'lift' ? 0.1 : 0.4, raw));
}
export const edgeFactor = (mm: number) => Math.min(1.6, Math.max(0.6, 20 / Math.max(1, mm)));
/** Training work in one session (see the top of this file). */
export function sessionWork(s: Load & Pick<Session, 'tutS' | 'edgeMm'>) {
  const i = intensity(s);
  return Math.max(0, s.tutS) * (s.hands === 'both' ? 1 : 0.5) * i * i * edgeFactor(s.edgeMm);
}
const curve = (w: number) => 40 * Math.log(1 + w / 40);
export const qualifies = (s: Pick<Session, 'tutS'>) => s.tutS >= MIN_TUT;

/** The scoring day (YYYY-MM-DD in Sydney time, same as the database). */
export function scoringDay(iso: string) { const p = tzParts(new Date(iso)); return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`; }
// same order as the database: by time, then id. A session not saved yet (no id) comes after a saved one at the same time.
const before = (a: Scored, b: Scored) => a.createdAt < b.createdAt || (a.createdAt === b.createdAt && (b.id == null || (a.id != null && a.id < b.id)));

/** Points for `s`, given the same climber's other sessions (any day; only ones earlier the same day count). */
export function sessionPoints(s: Scored, others: readonly Scored[] = []) {
  const day = scoringDay(s.createdAt);
  const earlier = others.filter(o => o !== s && (o.id == null || o.id !== s.id) && before(o, s) && scoringDay(o.createdAt) === day);
  const w0 = earlier.reduce((a, o) => a + sessionWork(o), 0);
  const gain = curve(w0 + sessionWork(s)) - curve(w0);
  const held = s.totalHangs > 0 ? s.fullHangs / s.totalHangs : 0;
  const showUp = qualifies(s) && !earlier.some(qualifies) ? 5 : 0;
  const pb = s.isPb && !earlier.some(o => o.isPb) ? 10 : 0;
  return Math.round(showUp + gain * (1 + 0.25 * held) + pb);
}
/** Re-score every session of `userId` on `day` in place (after a save, edit or delete). */
export function rescoreDay(sessions: Session[], userId: string, day: string) {
  const mine = sessions.filter(s => s.userId === userId && scoringDay(s.createdAt) === day);
  for (const s of mine) s.points = sessionPoints(s, mine);
}

/** Whole % only (finer values would reveal bodyweight), kept inside the 10–400% the database accepts
 *  so an extreme assist or added weight can't make a session impossible to save. */
export const loadPct = (bw: number | null, add: number, assist: number) =>
  bw && bw > 0 ? Math.min(400, Math.max(10, Math.round(((bw + add - assist) / bw) * 100))) : null;
/** No-hang lifts: weight lifted per hand × 2 as % of bodyweight (the same scale as a two-arm hang). */
export const liftPct = (bw: number | null, liftKg: number) =>
  bw && bw > 0 ? Math.min(400, Math.max(10, Math.round(((2 * liftKg) / bw) * 100))) : null;

/** Monday 00:00 (local time) of the week containing d. */
export function weekStart(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
/** Add whole calendar days in local time. Unlike adding 864e5 ms, this is correct across daylight-saving changes. */
export function addDays(d: Date | number, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
/** Parse a "YYYY-MM-DD" day key as local midnight (new Date('YYYY-MM-DD') would be UTC). */
export function parseDayKey(k: string) { const [y, m, d] = k.split('-').map(Number); return new Date(y!, m! - 1, d!); }

/** Week start (ms) → how many different days that week had a real session. */
function trainingDaysPerWeek(sessions: Pick<Session, 'createdAt' | 'tutS'>[]) {
  const days = new Map<number, Set<string>>();
  for (const s of sessions) {
    if (!qualifies(s)) continue;
    const d = new Date(s.createdAt), w = +weekStart(d);
    (days.get(w) ?? days.set(w, new Set()).get(w)!).add(dayKey(d));
  }
  return new Map([...days].map(([w, ds]) => [w, ds.size]));
}
/** The longest run ever of consecutive weeks with real sessions on at least 2 different days. */
export function bestWeekStreak(sessions: Pick<Session, 'createdAt' | 'tutS'>[]) {
  const good = [...trainingDaysPerWeek(sessions)].filter(([, n]) => n >= 2).map(([w]) => w).sort((a, b) => a - b);
  let best = 0, run = 0;
  good.forEach((w, i) => { run = i > 0 && +addDays(good[i - 1]!, 7) === w ? run + 1 : 1; best = Math.max(best, run); });
  return best;
}
/** Consecutive weeks (ending this week or last) with real sessions on at least 2 different days. */
export function weekStreak(sessions: Pick<Session, 'createdAt' | 'tutS'>[], now = new Date()) {
  const counts = trainingDaysPerWeek(sessions);
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
  value: (mine: Session[], all: Session[], now: Date) => number | null;
  /** Works over any stretch of time: the Ranks page shows it for this week, month, season or the last 90 days
   *  (see rankRows), and `value` only looks at the sessions it's given. */
  periodic?: boolean; }
const days = (n: number, now: Date) => +now - n * 864e5;
const recent = (xs: Session[], n: number, now: Date) => xs.filter(s => +new Date(s.createdAt) >= days(n, now));
/** Points from sessions at or after `from` (ms); null when there are none, so empty climbers stay off the board. */
const pointsSince = (xs: Session[], from: number) => { const ys = xs.filter(s => +new Date(s.createdAt) >= from); return ys.length ? ys.reduce((a, s) => a + s.points, 0) : null; };
// strength boards compare two-arm hangs (one-arm hangs have their own board)
const maxHang = (xs: Session[]) => xs.filter(s => s.mode === 'hang' && s.hands === 'both' && s.hang <= 15 && s.fullHangs > 0);
/** Best load (% bodyweight) on a two-arm ≤15s hang with one grip type. */
const gripBest = (xs: Session[], grip: string) => { const v = maxBy(maxHang(xs).filter(s => s.grip === grip && s.loadPct != null), s => s.loadPct!); return isFinite(v) ? v : null; };
/** Sets where every hang (both hands, every rep) was held full time. */
export function completedSets(s: Pick<Session, 'hangs'>) {
  const ok = new Map<number, boolean>();
  for (const h of s.hangs) ok.set(h.set, (ok.get(h.set) ?? true) && h.full);
  return [...ok.values()].filter(Boolean).length;
}

export const CATEGORIES: Category[] = [
  // Overall stays first: it's the default board (placeOf, the #1 overall crown).
  { id: 'overall', icon: 'award', name: 'Overall', group: 'Points', unit: 'pts', desc: 'Points over the last 28 days + streak bonus',
    value: (m, _a, now) => recent(m, 28, now).reduce((a, s) => a + s.points, 0) + 15 * weekStreak(m, now) },
  { id: 'loadpct', periodic: true, icon: 'bolt', name: '% Bodyweight', group: 'Strength', unit: '%', desc: 'Best load on a two-arm ≤15s hang, as % of bodyweight',
    value: m => { const v = maxBy(maxHang(m).filter(s => s.loadPct != null), s => s.loadPct!); return isFinite(v) ? v : null; } },
  { id: 'added', periodic: true, icon: 'add', name: 'Added weight', group: 'Strength', unit: 'kg', desc: 'Heaviest added weight on a two-arm ≤15s hang, 18–22mm edge',
    value: m => { const v = maxBy(maxHang(m).filter(s => s.edgeMm >= 18 && s.edgeMm <= 22), s => s.addedKg - s.assistKg); return isFinite(v) ? v : null; } },
  { id: 'edge', periodic: true, icon: 'edge', name: 'Smallest edge', group: 'Strength', unit: 'mm', lower: true, desc: 'Smallest edge held full time for 5s or more, at bodyweight or more',
    value: m => { const xs = m.filter(s => s.mode === 'hang' && s.assistKg === 0 && s.fullHangs > 0 && s.hang >= 5); return xs.length ? Math.min(...xs.map(s => s.edgeMm)) : null; } },
  { id: 'onearm', periodic: true, icon: 'fingers', name: 'One-arm', group: 'Strength', unit: 's', desc: 'Longest single one-arm hang at bodyweight or more (no assist)',
    value: m => { const v = maxBy(m.filter(s => s.mode === 'hang' && s.assistKg === 0).flatMap(s => s.hangs.filter(h => h.hand !== 'both')), h => h.held); return isFinite(v) ? v : null; } },
  { id: 'lift', periodic: true, icon: 'lift', name: 'No-hang lift', group: 'Strength', unit: 'kg', desc: 'Heaviest no-hang lift held full time',
    value: m => { const v = maxBy(m.filter(s => s.mode === 'lift' && s.fullHangs > 0), s => s.liftKg); return isFinite(v) ? v : null; } },
  { id: 'half', periodic: true, icon: 'half', name: 'Half crimp', group: 'Grip type', unit: '%', desc: 'Best half-crimp load as % of bodyweight', value: m => gripBest(m, 'Half crimp') },
  { id: 'fullc', periodic: true, icon: 'full', name: 'Full crimp', group: 'Grip type', unit: '%', desc: 'Best full-crimp load as % of bodyweight', value: m => gripBest(m, 'Full crimp') },
  { id: 'openh', periodic: true, icon: 'open', name: 'Open hand', group: 'Grip type', unit: '%', desc: 'Best open-hand load as % of bodyweight', value: m => gripBest(m, 'Open') },
  { id: 'drag', periodic: true, icon: 'drag', name: 'Drag', group: 'Grip type', unit: '%', desc: 'Best drag load as % of bodyweight', value: m => gripBest(m, 'Drag') },
  { id: 'pinch', periodic: true, icon: 'pinch', name: 'Pinch', group: 'Grip type', unit: '%', desc: 'Best pinch load as % of bodyweight', value: m => gripBest(m, 'Pinch') },
  { id: 'sloper', periodic: true, icon: 'sloper', name: 'Sloper', group: 'Grip type', unit: '%', desc: 'Best sloper load as % of bodyweight', value: m => gripBest(m, 'Sloper') },
  { id: 'tut', periodic: true, icon: 'hang', name: 'Hang time', group: 'Volume', unit: 's', desc: 'Time under tension',
    value: m => m.reduce((a, s) => a + s.tutS, 0) },
  { id: 'sets', periodic: true, icon: 'sets', name: 'Sets', group: 'Volume', unit: '', desc: 'Sets with every hang held full time',
    value: m => m.reduce((a, s) => a + completedSets(s), 0) },
  { id: 'hangs', periodic: true, icon: 'mountain', name: 'Total hangs', group: 'Volume', unit: '', desc: 'Hangs held full time',
    value: m => m.reduce((a, s) => a + s.fullHangs, 0) },
  { id: 'streak', icon: 'streak', name: 'Weekly streak', group: 'Consistency', unit: 'wks', desc: 'Consecutive weeks training on 2+ days',
    value: (m, _a, now) => weekStreak(m, now) },
  { id: 'consist', periodic: true, icon: 'calendar', name: 'Days trained', group: 'Consistency', unit: '', desc: `Days with ${MIN_TUT}s or more under tension`,
    value: m => new Set(m.filter(qualifies).map(s => dayKey(new Date(s.createdAt)))).size },
  { id: 'improved', icon: 'chart', name: 'Most improved', group: 'Consistency', unit: '%', desc: 'Best load %BW this month vs the month before',
    value: (m, _a, now) => {
      const a = maxBy(maxHang(recent(m, 30, now)).filter(s => s.loadPct != null), s => s.loadPct!);
      const b = maxBy(maxHang(m.filter(s => { const t = +new Date(s.createdAt); return t < days(30, now) && t >= days(60, now); })).filter(s => s.loadPct != null), s => s.loadPct!);
      return isFinite(a) && isFinite(b) && b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : null;
    } },
  { id: 'week', icon: 'calendar', name: 'This week', group: 'Points', unit: 'pts', desc: 'Points since Monday',
    value: (m, _a, now) => pointsSince(m, +weekStart(now)) },
  { id: 'month', icon: 'calendar', name: 'This month', group: 'Points', unit: 'pts', desc: 'Points since the 1st of the month',
    value: (m, _a, now) => pointsSince(m, +new Date(now.getFullYear(), now.getMonth(), 1)) },
  { id: 'season', icon: 'crown', name: 'This season', group: 'Points', unit: 'pts', desc: 'Points this season. The winner is crowned season champion',
    value: (m, _a, now) => { const se = seasonOf(now), xs = m.filter(x => inSeason(x, se)); return xs.length ? Math.round(xs.reduce((a, x) => a + x.points, 0)) : null; } },
];

/** Most-used protocol (warm-ups don't count). Ties go to the one used most recently. */
export function favouriteProtocol(sessions: Session[]): { key: string; name: string; count: number; pct: number } | null {
  const xs = sessions.filter(s => s.protocolKey !== 'warm');
  if (!xs.length) return null;
  const tally = new Map<string, { name: string; count: number; last: string }>();
  for (const s of xs) {
    const t = tally.get(s.protocolKey) ?? { name: s.protocolName, count: 0, last: '' };
    t.count++; if (s.createdAt > t.last) { t.last = s.createdAt; t.name = s.protocolName; }
    tally.set(s.protocolKey, t);
  }
  const [key, best] = [...tally.entries()].sort((a, b) => b[1].count - a[1].count || b[1].last.localeCompare(a[1].last))[0]!;
  return { key, name: best.name, count: best.count, pct: Math.round((best.count / xs.length) * 100) };
}
