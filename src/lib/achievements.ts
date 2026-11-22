import type { Session } from './types';
import { weekStreak, dayKey, isCrimp, parseDayKey } from './scoring';

export const TIER_NAMES = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Emerald', 'Diamond', 'Master', 'Grand Master', 'GOAT'];
export const TIER_COLOURS = ['#8a8f94', '#c8814a', '#c9d1d9', '#f2c14e', '#9fd8d1', '#2ecc71', '#7ad7f0', '#b48cff', '#ff5a8a', '#ffd700'];

export interface Ctx {
  sessions: Session[];      // mine, any order
  flags: Record<string, any>; // one-off event flags + counters kept in private settings
  hasAvatar: boolean;
  customBoards: number; customProtocols: number;
  heartsReceived: number; commentsGiven: number;
  pointsTotal: number;
  seasonsWon?: number;
}
export interface Tiered { icon: string; name: string; desc: string; thresholds: number[]; lower?: boolean; value: (c: Ctx) => number | null; }
export interface OneOff { icon: string; name: string; desc: string; secret?: boolean; hint?: string; got: (c: Ctx) => boolean; }

const max = (xs: number[]) => (xs.length ? Math.max(...xs) : null);
const hr = (s: Session) => new Date(s.createdAt).getHours();

export const TIERED: Tiered[] = [
  { icon: '🧗', name: 'Sessions', desc: 'Complete hangboard sessions.', thresholds: [1, 5, 10, 25, 50, 100, 200, 365, 500, 1000], value: c => c.sessions.length },
  { icon: '🔥', name: 'Week streak', desc: 'Consecutive weeks with at least 2 sessions.', thresholds: [1, 2, 4, 8, 12, 20, 26, 40, 52, 104], value: c => weekStreak(c.sessions) },
  { icon: '🏔️', name: 'Total hangs', desc: "Every hang you've logged, all time.", thresholds: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000], value: c => c.sessions.reduce((a, s) => a + s.totalHangs, 0) },
  { icon: '🏋️', name: 'Added weight', desc: 'Heaviest added weight on a ≤15s hang (kg).', thresholds: [2.5, 5, 10, 15, 20, 25, 30, 40, 50, 60], value: c => max(c.sessions.filter(s => s.mode === 'hang' && s.hang <= 15 && s.fullHangs > 0).map(s => s.addedKg)) },
  { icon: '📏', name: 'Smallest edge', desc: 'Smallest edge held full time at bodyweight (mm).', lower: true, thresholds: [25, 20, 18, 15, 14, 12, 10, 8, 6, 5], value: c => { const xs = c.sessions.filter(s => s.mode === 'hang' && s.assistKg === 0 && s.fullHangs > 0).map(s => s.edgeMm); return xs.length ? Math.min(...xs) : null; } },
  { icon: '⏱', name: 'Longest hang', desc: 'Longest single hang, any edge (seconds).', thresholds: [10, 20, 30, 45, 60, 75, 90, 120, 150, 180], value: c => max(c.sessions.flatMap(s => s.hangs.map(h => h.held))) },
  { icon: '🌱', name: 'Abrahang days', desc: "Days you've done Abrahangs.", thresholds: [1, 7, 14, 30, 60, 100, 150, 200, 300, 365], value: c => new Set(c.sessions.filter(s => s.protocolKey === 'abra').map(s => dayKey(new Date(s.createdAt)))).size },
  { icon: '🤏', name: 'Crimp sessions', desc: 'Sessions using half or full crimp.', thresholds: [1, 5, 10, 25, 50, 75, 100, 150, 200, 300], value: c => c.sessions.filter(s => isCrimp(s.grip)).length },
  { icon: '✋', name: 'Open-hand sessions', desc: 'Sessions using open hand.', thresholds: [1, 5, 10, 25, 50, 75, 100, 150, 200, 300], value: c => c.sessions.filter(s => s.grip === 'Open').length },
  { icon: '☝️', name: 'One-arm hangs', desc: 'Single-arm hangs completed.', thresholds: [1, 5, 10, 25, 50, 100, 150, 250, 400, 600], value: c => c.sessions.reduce((a, s) => a + s.hangs.filter(h => h.hand !== 'both' && h.full).length, 0) },
  { icon: '🪨', name: 'No-hang lift', desc: 'Heaviest no-hang lift (kg).', thresholds: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100], value: c => max(c.sessions.filter(s => s.mode === 'lift').map(s => s.liftKg)) },
  { icon: '👑', name: 'Seasons won', desc: 'Finish a season (Summer, Autumn, Winter or Spring) with the most points.', thresholds: [1, 2, 3, 4, 6, 8, 10, 12, 16, 20], value: c => c.seasonsWon ?? 0 },
  { icon: '💎', name: 'Points', desc: 'All-time points earned.', thresholds: [50, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000], value: c => c.pointsTotal },
];

const sameProtoRun = (ss: Session[]) => {
  const byDay = new Map<string, Set<string>>();
  for (const s of ss) { const k = dayKey(new Date(s.createdAt)); (byDay.get(k) ?? byDay.set(k, new Set()).get(k)!).add(s.protocolKey); }
  for (const [k, protos] of byDay) for (const p of protos) {
    let n = 1; const d = parseDayKey(k);
    while (n < 7) { d.setDate(d.getDate() + 1); if (byDay.get(dayKey(d))?.has(p)) n++; else break; }
    if (n >= 7) return true;
  }
  return false;
};

export const ONE_OFFS: OneOff[] = [
  { icon: '👶', name: 'First Hang', desc: 'Complete your very first session.', got: c => c.sessions.length > 0 },
  { icon: '📸', name: 'Say Cheese', desc: 'Upload a profile photo.', got: c => c.hasAvatar },
  { icon: '🪵', name: 'Board Collector', desc: 'Add your own hangboard.', got: c => c.customBoards > 0 },
  { icon: '🛠️', name: 'Mad Scientist', desc: 'Create a custom protocol.', got: c => c.customProtocols > 0 },
  { icon: '🌅', name: 'Dawn Patrol', desc: 'Finish a session before 6am.', got: c => c.sessions.some(s => hr(s) < 6 && hr(s) >= 4) },
  { icon: '🦉', name: 'Night Owl', desc: 'Finish a session after 11pm.', got: c => c.sessions.some(s => hr(s) >= 23) },
  { icon: '💯', name: 'Perfect Session', desc: 'Every hang held full time on Max Hangs.', got: c => c.sessions.some(s => s.protocolKey === 'max' && s.totalHangs > 0 && s.fullHangs === s.totalHangs) },
  { icon: '🙌', name: 'Ambidextrous', desc: 'Left and right within 5% in a one-arm session.', got: c => c.sessions.some(s => { const L = s.hangs.filter(h => h.hand === 'L').reduce((a, h) => a + h.held, 0), R = s.hangs.filter(h => h.hand === 'R').reduce((a, h) => a + h.held, 0); return L > 0 && R > 0 && Math.abs(L - R) / Math.max(L, R) <= 0.05; }) },
  { icon: '⚡', name: 'Speedrun', desc: 'Finish a JUST LET ME HANG session.', got: c => c.sessions.some(s => s.protocolKey === 'jlmh') },
  { icon: '🏅', name: 'PB Machine', desc: 'Set 3 personal bests in one week.', got: c => { const pbs = c.sessions.filter(s => s.isPb).map(s => +new Date(s.createdAt)).sort((a, b) => a - b); return pbs.some((t, i) => pbs[i + 2] !== undefined && pbs[i + 2]! - t <= 7 * 864e5); } },
  { icon: '💬', name: 'Hype Squad', desc: "Comment on 10 other climbers' sessions.", got: c => c.commentsGiven >= 10 },
  { icon: '❤️', name: 'Heart Throb', desc: 'Get 50 hearts on your activity.', got: c => c.heartsReceived >= 50 },
  // secrets
  { secret: true, icon: '🫠', name: 'Let It Go', desc: 'Let go early 5 times in one session.', hint: 'Sometimes you just have to…', got: c => c.sessions.some(s => s.hangs.filter(h => !h.full).length >= 5) },
  { secret: true, icon: '😭', name: 'Feelings Valid', desc: 'Finish a session after picking 😭 as your mood.', hint: 'Cry, then crimp.', got: c => c.sessions.some(s => s.feel === '😭') },
  { secret: true, icon: '🏳️', name: 'Dramatic Exit', desc: 'Give up within 10 seconds of starting.', hint: 'Not today, Satan.', got: c => !!c.flags.dramaticExit },
  { secret: true, icon: '🎄', name: 'Ho Ho Hang', desc: 'Hang on Christmas Day.', hint: 'Santa crimps too.', got: c => c.sessions.some(s => { const d = new Date(s.createdAt); return d.getMonth() === 11 && d.getDate() === 25; }) },
  { secret: true, icon: '🐸', name: 'Leap Hang', desc: 'Hang on February 29th.', hint: 'Only every four years…', got: c => c.sessions.some(s => { const d = new Date(s.createdAt); return d.getMonth() === 1 && d.getDate() === 29; }) },
  { secret: true, icon: '🌚', name: '3am Thoughts', desc: 'Finish a session between 3 and 4am.', hint: "Can't sleep? Hang.", got: c => c.sessions.some(s => hr(s) === 3) },
  { secret: true, icon: '🔁', name: 'Groundhog Day', desc: 'Same protocol, 7 days in a row.', hint: 'Again. Again. Again.', got: c => sameProtoRun(c.sessions) },
  { secret: true, icon: '🐌', name: 'Slow Burn', desc: 'Stay paused for 30+ minutes mid-session.', hint: 'Take your time…', got: c => !!c.flags.slowBurn },
  { secret: true, icon: '😎', name: 'Nice.', desc: 'Finish a session with exactly 69s under tension.', hint: 'Nice.', got: c => c.sessions.some(s => s.tutS === 69) },
  { secret: true, icon: '🌀', name: 'Spin Cycle', desc: 'Change your accent colour 10 times in one day.', hint: 'Indecisive? Fabulous.', got: c => !!c.flags.spinCycle },
  { secret: true, icon: '👀', name: 'Peeping Tom', desc: 'Check the leaderboard 20 times in a day.', hint: 'Obsessed? Never.', got: c => !!c.flags.peepingTom },
  { secret: true, icon: '🧂', name: 'Chalk Bucket', desc: 'Tap the “Chalk up” text 10 times during get-ready.', hint: 'Too much chalk is never enough.', got: c => !!c.flags.chalkBucket },
];

export function tierOf(v: number | null, t: number[], lower?: boolean) {
  if (v == null) return 0;
  return t.filter(x => (lower ? v <= x : v >= x)).length;
}

/** Returns names of achievements (tier-ups and one-offs) newly unlocked between two contexts. */
export function diffUnlocks(before: Ctx, after: Ctx): { icon: string; text: string }[] {
  const out: { icon: string; text: string }[] = [];
  for (const a of TIERED) {
    const b = tierOf(a.value(before), a.thresholds, a.lower), n = tierOf(a.value(after), a.thresholds, a.lower);
    if (n > b) out.push({ icon: a.icon, text: `${a.name} → ${TIER_NAMES[n - 1]}` });
  }
  for (const o of ONE_OFFS) if (!o.got(before) && o.got(after)) out.push({ icon: o.icon, text: `${o.secret ? 'Secret: ' : ''}${o.name}` });
  return out;
}

/** Bump a per-day counter flag; returns the new count. */
export function bumpDaily(flags: Record<string, any>, key: string) {
  const today = dayKey(new Date());
  const c = flags[key + 'Day'] === today ? (flags[key + 'Count'] ?? 0) + 1 : 1;
  flags[key + 'Day'] = today; flags[key + 'Count'] = c;
  return c;
}
