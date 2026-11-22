// Public climber profile: training stats, PBs, consistency and badges.
// Shows no private details: no bodyweight, % bodyweight, age or height. Location only appears
// when the climber ticked "Show my location on my profile".
import { esc, avatar, sheet, toast } from '../lib/ui';
import { ic, hydrateIcons } from '../lib/icons';
import { state, seasonsWon } from '../lib/state';
import { weekStreak, dayKey, addDays, weekStart, favouriteProtocol, CATEGORIES } from '../lib/scoring';
import { TIERED, TIER_NAMES, TIER_COLOURS, tierOf, type Ctx } from '../lib/achievements';
import type { Session } from '../lib/types';
import { sessRow } from './stats';
import { placeOf } from '../lib/leaderboard';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// other climbers' full history, kept for a few minutes so reopening a profile is instant but stays fresh
const cache = new Map<string, { at: number; xs: Session[] }>(), TTL = 5 * 60e3;
document.addEventListener('bf:sessions-changed', () => cache.clear());
export const forgetClimber = (uid?: string) => { if (uid) cache.delete(uid); else cache.clear(); };

async function historyOf(uid: string): Promise<Session[]> {
  if (uid === state.me?.id) return state.sessions.filter(s => s.userId === uid);
  const hit = cache.get(uid);
  if (hit && Date.now() - hit.at < TTL) return hit.xs;
  const xs = await state.store.listSessions({ userId: uid });
  cache.set(uid, { at: Date.now(), xs });
  return xs;
}

let opening = false;
export async function openClimber(uid: string) {
  const p = state.profiles.get(uid); if (!p || opening || document.querySelector('.climber-sheet')) return; // ignore double taps
  opening = true; setTimeout(() => { opening = false; }, 400);
  let body: HTMLElement | null = null;
  sheet({ body: `<div class="climber"><div class="sub center">Loading…</div></div>`, onMount: el => { body = el.querySelector('.climber'); el.classList.add('climber-sheet'); } });
  let xs: Session[];
  try { xs = await historyOf(uid); } catch (e: any) {
    if (body && (body as HTMLElement).isConnected) (body as HTMLElement).innerHTML = `<p class="sub center">${esc(e.message ?? 'Couldn’t load that profile')}</p>`;
    toast(e.message ?? 'Couldn’t load that profile'); return;
  }
  if (!body || !(body as HTMLElement).isConnected) return;
  const el = body as HTMLElement, now = new Date();

  const rank = placeOf(uid); // same ranking as the Ranks page

  // personal bests (no bodyweight-derived numbers)
  const hangs = xs.filter(s => s.mode === 'hang' && s.fullHangs > 0);
  const maxBy = <T,>(a: T[], f: (x: T) => number) => a.reduce<T | null>((m, x) => (m == null || f(x) > f(m) ? x : m), null);
  const heavy = maxBy(hangs.filter(s => s.hang <= 15), s => s.addedKg - s.assistKg);
  const edge = maxBy(hangs.filter(s => s.assistKg === 0), s => -s.edgeMm);
  const long = maxBy(xs.flatMap(s => s.hangs.map(h => ({ s, h }))), x => Number(x.h.held) || 0);
  const lift = maxBy(xs.filter(s => s.mode === 'lift'), s => s.liftKg);
  const pb = (icon: string, name: string, v: string) => `<div class="cpb">${ic(icon)}<span>${name}</span><b>${v}</b></div>`;
  const kg = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n)} kg`;
  const pbs = [heavy && pb('add', 'Heaviest hang', kg(heavy.addedKg - heavy.assistKg)), edge && pb('edge', 'Smallest edge', `${edge.edgeMm} mm`),
    long && pb('hang', 'Longest hang', `${Math.round(Number(long.h.held) || 0)} s`), lift && pb('lift', 'No-hang lift', `${lift.liftKg} kg`)].filter(Boolean).join('');

  // last 5 weeks of consistency
  const days = new Set(xs.map(s => dayKey(new Date(s.createdAt))));
  const start = addDays(weekStart(now), -28);
  const grid = Array.from({ length: 35 }, (_, i) => { const d = addDays(start, i), on = days.has(dayKey(d)), fut = d > now;
    return `<i title="${d.getDate()} ${MON[d.getMonth()]}" class="${on ? 'on' : ''}" style="${fut ? 'opacity:.3' : ''}"></i>`; }).join('');

  // badges — only ones that can be worked out from public session data
  const titles = seasonsWon(uid);
  const ctx: Ctx = { sessions: xs, flags: {}, hasAvatar: !!p.avatarUrl, customBoards: 0, customProtocols: 0, heartsReceived: 0, commentsGiven: 0, pointsTotal: xs.reduce((a, s) => a + s.points, 0), seasonsWon: titles };
  const badges = TIERED.map(a => ({ a, lv: tierOf(a.value(ctx), a.thresholds, a.lower) })).filter(x => x.lv > 0).sort((x, y) => y.lv - x.lv);

  const since = new Date(p.createdAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  el.innerHTML = `
    <div class="center">${avatar(p, 'cav')}<h2 style="margin:10px 0 2px">${esc(p.name)}</h2>${p.location ? `<p class="cloc">${ic('pin')} ${esc(p.location)}</p>` : ''}<p class="sub" style="margin:0">Member since ${since}</p>${titles ? `<p class="titles">${ic('crown')} ${titles > 1 ? `${titles}× season champion` : 'Season champion'}</p>` : ''}</div>
    <div class="stats" style="margin:14px 0"><div class="stat"><b>${xs.length}</b>sessions</div><div class="stat"><b>${weekStreak(xs, now)} ${ic('streak')}</b>wk streak</div><div class="stat"><b>${rank}</b>overall</div></div>
    ${(() => { const f = favouriteProtocol(xs); return f ? `<p class="fav">${ic('star')} Favourite protocol: <b>${esc(f.name)}</b> · ${f.count} session${f.count > 1 ? 's' : ''} (${f.pct}%)</p>` : ''; })()}
    ${pbs ? `<h3>${ic('medal')} Personal bests</h3><div class="cpbs">${pbs}</div>` : ''}
    <h3 style="margin-top:14px">${ic('calendar')} Last 5 weeks</h3><div class="cgrid">${grid}</div>
    ${badges.length ? `<h3 style="margin-top:14px">${ic('award')} Badges</h3><div class="cbadges">${badges.map(({ a, lv }) => `<button type="button" class="cbadge" data-badge="${TIERED.indexOf(a)}" style="--tc:${TIER_COLOURS[lv - 1]}" aria-label="${a.name}: ${TIER_NAMES[lv - 1]}">${ic(a.icon)}<small>${TIER_NAMES[lv - 1]}</small></button>`).join('')}</div><p class="sub" style="font-size:12px;margin:6px 0 0">Tap a badge to see what it’s for.</p>` : ''}
    <h3 style="margin-top:14px">${ic('calendar')} Recent sessions</h3><div class="daysess">${xs.slice(0, 5).map(s => sessRow(s, false)).join('') || '<p class="sub">No sessions yet.</p>'}</div>`;
  hydrateIcons(el);

  // tapping a badge explains it, inside the profile so it doesn't close the sheet
  el.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest('[data-badge]') as HTMLElement | null; if (!b) return;
    const a = TIERED[+b.dataset.badge!]!, v = a.value(ctx), lv = tierOf(v, a.thresholds, a.lower), nx = a.thresholds[lv];
    el.querySelector('.cbinfo')?.remove();
    el.querySelectorAll('.cbadge.on').forEach(x => x.classList.remove('on'));
    if (b.dataset.open) { delete b.dataset.open; return; }
    el.querySelectorAll<HTMLElement>('[data-open]').forEach(x => delete x.dataset.open);
    b.dataset.open = '1'; b.classList.add('on');
    const box = document.createElement('div'); box.className = 'cbinfo'; box.style.setProperty('--tc', TIER_COLOURS[lv - 1]!);
    box.innerHTML = `<b>${ic(a.icon)} ${esc(a.name)} · <span>${TIER_NAMES[lv - 1]}</span></b><p>${esc(a.desc)}</p>
      <small>${esc(p.name)} is at ${v}${nx != null ? `. Next tier, ${TIER_NAMES[lv]}, at ${a.lower ? '≤ ' : ''}${nx}.` : '. Top tier reached.'}</small>`;
    b.parentElement!.after(box); hydrateIcons(box);
  });
}
