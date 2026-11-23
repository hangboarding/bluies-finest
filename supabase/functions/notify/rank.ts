// Who a new session knocked down from the top 3 of the Overall board. No imports and no Deno APIs, so the
// app's tests can check it against the app's own ranking (tests/rank-alerts.test.ts).
//
// The rules are the app's Overall board (src/lib/scoring.ts and src/lib/leaderboard.ts): points from the last
// 28 days + 15 per week of the current weekly streak (weeks with real sessions, 15s+ under tension, on 2 or
// more days; this week counts once it has 2), over everyone's sessions since the earlier of 90 days ago and
// the start of the season. Equal totals share a place (1, 2, 2, 4). The app counts weeks in each phone's own
// time zone; this uses Blue Mountains time, like the seasons and the scoring day.

export interface RankSession { id: string; user_id: string; created_at: string; points: number; tut_s: number }
/** `was` and `now` are places on the Overall board. */
export interface Overtaken { userId: string; was: number; now: number }

const TZ = 'Australia/Sydney', DAY = 864e5, POOL_DAYS = 90, MIN_TUT = 15;
const fmt = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' });
function parts(ms: number) {
  const p = fmt.formatToParts(new Date(ms)), g = (t: string) => +p.find(x => x.type === t)!.value;
  return { y: g('year'), m: g('month'), d: g('day'), h: g('hour'), min: g('minute'), s: g('second') };
}
/** The calendar day in Blue Mountains time, as a day number. */
const dayNo = (ms: number) => { const p = parts(ms); return Date.UTC(p.y, p.m - 1, p.d) / DAY; };
/** The Monday of that day's week, as a day number (day 0, 1 Jan 1970, was a Thursday). */
const mondayOf = (day: number) => day - ((day + 3) % 7);
/** The instant of midnight on y-m-d in Blue Mountains time (daylight saving included). */
function midnight(y: number, m: number, d: number) {
  let t = Date.UTC(y, m - 1, d);
  for (let i = 0; i < 3; i++) { const p = parts(t); t += Date.UTC(y, m - 1, d) - Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s); }
  return t;
}
/** Start of the current season (Summer Dec–Feb, Autumn Mar–May, Winter Jun–Aug, Spring Sep–Nov). */
function seasonStart(now: number) {
  const { y, m } = parts(now);
  return m <= 2 ? midnight(y - 1, 12, 1) : midnight(y, m - (m % 3), 1);
}
/** Sessions before this don't count towards anyone's place. */
export const poolStart = (now: number) => Math.min(now - POOL_DAYS * DAY, seasonStart(now));

function weekStreak(xs: RankSession[], now: number) {
  const weeks = new Map<number, Set<number>>();
  for (const s of xs) {
    if (s.tut_s < MIN_TUT) continue;
    const d = dayNo(+new Date(s.created_at)), w = mondayOf(d);
    (weeks.get(w) ?? weeks.set(w, new Set()).get(w)!).add(d);
  }
  const days = (w: number) => weeks.get(w)?.size ?? 0;
  let w = mondayOf(dayNo(now)), n = 0;
  if (days(w) < 2) w -= 7; // this week isn't over yet, so it doesn't break the streak
  while (days(w) >= 2) { n++; w -= 7; }
  return n;
}

/** Each climber's Overall total. Only climbers with a session in `xs` are on the board. */
export function overallTotals(xs: RankSession[], now: number) {
  const by = new Map<string, RankSession[]>();
  for (const s of xs) (by.get(s.user_id) ?? by.set(s.user_id, []).get(s.user_id)!).push(s);
  const out = new Map<string, number>();
  for (const [uid, mine] of by)
    out.set(uid, mine.filter(s => +new Date(s.created_at) >= now - 28 * DAY).reduce((a, s) => a + s.points, 0) + 15 * weekStreak(mine, now));
  return out;
}
/** Place on the board: 1 + how many have a strictly higher total. */
export function places(totals: Map<string, number>) {
  const vs = [...totals.values()];
  return new Map([...totals].map(([uid, v]) => [uid, 1 + vs.filter(x => x > v).length]));
}

/** Climbers who were in the top 3 and ahead of the session's climber, and are now behind them and lower down.
 *  "Before" leaves out this session and the climber's later ones, so a workout's sessions arriving together
 *  still find the one that made the difference (the caller tells each pair only once a day). */
export function overtaken(pool: RankSession[], s: RankSession, now = Date.now()): Overtaken[] {
  const from = poolStart(now), t = +new Date(s.created_at);
  const inPool = pool.filter(x => +new Date(x.created_at) >= from && x.id !== s.id);
  if (t < from) return [];
  const before = inPool.filter(x => x.user_id !== s.user_id || +new Date(x.created_at) < t);
  const vb = overallTotals(before, now), va = overallTotals([...inPool, s], now);
  const pb = places(vb), pa = places(va), me = s.user_id;
  const meBefore = vb.get(me) ?? -Infinity, meNow = va.get(me)!;
  const out: Overtaken[] = [];
  for (const [uid, was] of pb) {
    if (uid === me || was > 3) continue;
    const them = va.get(uid)!, place = pa.get(uid)!;
    if (meBefore < vb.get(uid)! && meNow > them && place > was) out.push({ userId: uid, was, now: place });
  }
  return out.sort((a, b) => a.was - b.was);
}

/** The scoring day in Blue Mountains time (YYYY-MM-DD), for telling each pair once a day. */
export const sydneyDay = (ms: number) => { const p = parts(ms); return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`; };
