import { $, esc, avatar } from '../lib/ui';
import { ic, hydrateIcons } from '../lib/icons';
import { CATEGORIES, type Category } from '../lib/scoring';
import { state, saveSettings } from '../lib/state';
import { rankRows, PERIODS, type Period, type RankRow } from '../lib/leaderboard';
import { bumpDaily } from '../lib/achievements';
import { seasonOf, daysLeft, seasonNameFromStart } from '../lib/seasons';
import { crownSvg, titlesOf } from '../lib/crown';
import { myChampCard } from './champ-hero';
import { checkUnlocks } from './unlocks';

// What the leaderboard shows: a board (Points, or one of the strength, grip, volume and consistency boards) for a
// period. Points has its own board for each period (Overall is the last 28 days plus the streak bonus); the
// others work out the same measure over the period (Overall: the last 90 days). Weekly streak and Most improved
// have their own window built in, so they're in a card of their own underneath.
let board = 'points', period: Period = 'season', side = 'streak';

const CAT = (id: string) => CATEGORIES.find(c => c.id === id)!;
const SIDE = ['streak', 'improved'];
const SHORT: Record<Period, string> = { week: 'Week', month: 'Month', season: 'Season', overall: 'Overall' };
const PHRASE: Record<Period, string> = { week: 'this week', month: 'this month', season: 'this season', overall: 'over the last 90 days' };
/** The category behind what's picked. */
const current = (): Category => (board === 'points' ? undefined : CATEGORIES.find(c => c.id === board && c.periodic)) ?? CAT(period);

const boardOptions = () => `<option value="points"${board === 'points' ? ' selected' : ''}>Points</option>`
  + [...new Set(CATEGORIES.filter(c => c.periodic).map(c => c.group))].map(g => `<optgroup label="${g}">${CATEGORIES.filter(c => c.group === g && c.periodic)
    .map(c => `<option value="${c.id}"${c.id === board ? ' selected' : ''}>${c.name}</option>`).join('')}</optgroup>`).join('');

export function renderRanks(root: HTMLElement) {
  const F = state.settings.flags, peeks = bumpDaily(F, 'peek');
  if (peeks >= 20 && !F.peepingTom) { F.peepingTom = true; saveSettings(); checkUnlocks(); }
  else if (peeks % 5 === 0) saveSettings(); // persist the counter occasionally, not on every visit
  root.innerHTML = `${myChampCard()}<div class="card t10card">
    <div class="t10hd"><h3>${ic('top10')} Leaderboard</h3><select id="rkBoard" class="t10sel" aria-label="Rank by">${boardOptions()}</select></div>
    <div class="t10spin" id="t10spin" role="group" aria-label="Period, shown in turn">
      ${PERIODS.map(p => `<button type="button" class="t10dot" data-spin="${p}" aria-pressed="false"><span>${SHORT[p]}</span><i aria-hidden="true"></i></button>`).join('')}
      <button type="button" class="t10play" id="t10play"></button>
    </div>
    <p class="sub t10note" id="catDesc"></p>
    <div class="podium" id="podium"></div><div class="champ" id="champ"></div>
    <div class="t10" id="t10"></div>
    <p class="sub t10gapline" id="gap"></p>
    <div class="t10tip hide" id="t10tip" role="tooltip"></div>
  </div>
  ${sideCard()}
  ${hallOfChampions()}
  <p class="sub center" style="font-size:12px">Tap anyone to see their profile. Seasons: Summer Dec–Feb, Autumn Mar–May, Winter Jun–Aug, Spring Sep–Nov. Overall points = points from the last 28 days + 15 per week of streak (a week with training on 2+ days); on the other boards Overall is the last 90 days. Points reward time under tension, heavier load (as % of bodyweight: heavier counts for clearly more), smaller edges, holding hangs full time and PBs. One-arm hangs count each arm, so left + right at bodyweight scores like a two-arm hang at +100%. Points are counted per day: more training always earns more, each extra minute a little less, and splitting it into lots of short sessions earns nothing extra.</p>`;
  $('#rkBoard').addEventListener('change', e => { board = (e.target as HTMLSelectElement).value; spun = 0; hideTip(); draw(true); });
  wireChart();
  wireSide();
  hydrateIcons(root);
  draw(); drawSide();
  startSpin();
}

function fmt(v: number, unit: string) {
  const n = Number.isInteger(v) ? v.toLocaleString() : v.toFixed(1);
  return unit === '%' ? `${n}%` : unit === 'kg' ? `${v > 0 ? '+' : ''}${n} kg` : unit === 'wks' && v === 1 ? '1 wk' : unit ? `${n} ${unit}` : n;
}
/** The sparkles the crown twinkles in with (see .podium.rise in app.css). */
const TWINKLE = '<i class="tw" aria-hidden="true"></i>'.repeat(4);
/** Restart a CSS entrance animation (`.swap`) on an element whose content was just replaced. */
function swapIn(el: HTMLElement, on: boolean) { el.classList.remove('swap'); void el.offsetWidth; if (on) el.classList.add('swap'); }

/** The leaderboard for what's picked: what it measures, the podium, who rules it, the top 10 as bars and how far
 *  I am from the next place up. `morph`: move from what's shown now rather than starting fresh. */
function draw(morph = false) {
  const c = current(), now = new Date(), rows = rankRows(c, now, period), me = state.me?.id, unit = c.unit;
  const se = seasonOf(now), left = daysLeft(se, now);
  const what = board === 'points' ? c.name.toLowerCase() : `${c.name.toLowerCase()} ${PHRASE[period]}`; // "this season", "hang time this month"
  const desc = $('#catDesc');
  desc.innerHTML = board === 'points' && period === 'season'
    ? `${ic('crown')} <b>${se.name}</b> · ${left ? `${left + 1} days left` : 'last day!'}. Most points wins the season`
    : `${ic(c.icon)} ${esc(c.desc)}${board === 'points' ? '' : `, ${PHRASE[period]}`}${c.lower ? '. Smaller is better' : ''}`;
  hydrateIcons(desc);
  const nm = (r: RankRow) => esc(r.p.name) + (r.p.id === me ? ' (you)' : '');
  const pod = (r: RankRow | undefined, k: 1 | 2 | 3) => r ? `<div class="pod p${k}" data-uid="${r.p.id}" data-v="${r.v}">${r.place === 1 ? `<span class="crown">${crownSvg(r.p.id)}${TWINKLE}</span>` : ''}${avatar(r.p, 'ph')}<b>${nm(r)}</b>
      <div class="sub pv">${fmt(r.v, unit)}</div><div class="blk">${k}</div></div>` : `<div class="pod p${k}"></div>`;
  const podium = $('#podium');
  podium.innerHTML = rows.length ? pod(rows[1], 2) + pod(rows[0], 1) + pod(rows[2], 3) : '';
  const top = rows.filter(r => r.place === 1), champ = $('#champ');
  champ.innerHTML = !rows[0] ? `No one has a result here ${period === 'overall' ? 'yet' : PHRASE[period]}. Be the first!`
    : top.length > 1 ? `${ic('crown')} ${top.map(r => r.p.id === me ? 'You' : esc(r.p.name)).join(' & ')} share ${what} with ${fmt(rows[0].v, unit)}`
    : `${ic('crown')} ${rows[0].p.id === me ? 'You rule' : esc(rows[0].p.name) + ' rules'} ${what} with ${fmt(rows[0].v, unit)}`;
  hydrateIcons(podium); hydrateIcons(champ);
  const mi = rows.findIndex(r => r.p.id === me);
  const ahead = mi > 0 ? rows.slice(0, mi).reverse().find(r => r.v !== rows[mi]!.v) : undefined; // first one actually ahead of me
  $('#gap').textContent = mi < 0 ? (rows.length ? `Log a session ${period === 'overall' ? '' : PHRASE[period] + ' '}to get on this board.` : '')
    : rows[mi]!.place === 1 ? (top.length > 1 ? '🥇 Tied for number one!' : "🥇 You're number one!")
    : ahead ? `⬆ ${fmt(Math.abs(ahead.v - rows[mi]!.v), unit).replace('+', '')} to pass ${ahead.p.name}` : '';
  for (const el of [desc, champ, $('#gap')]) swapIn(el, morph && !reduced());
  // the podium rises every time it's drawn: the blocks fill up (3rd, 2nd, then 1st), then the crown twinkles in
  podium.classList.remove('rise'); podium.style.minHeight = ''; void podium.offsetWidth;
  if (!reduced()) {
    // hold its full height while the blocks fill up, so nothing below it moves
    if (podium.offsetHeight) podium.style.minHeight = `${podium.offsetHeight}px`;
    podium.classList.add('rise');
    for (const p of podium.querySelectorAll<HTMLElement>('.pod[data-v]')) countTo(p.querySelector<HTMLElement>('.pv')!, 0, +p.dataset.v!, x => fmt(x, unit));
  }
  syncSpin();
  drawChart(rows, c, morph);
}

// ---------------- the top 10 as bars ----------------
// One series (horizontal bars from a zero baseline), so one hue; your own bar is a darker step
// and is labelled "You", so it never relies on colour alone. Values sit at the bar tips, the dashed
// line is the whole group's average, and you're pinned underneath if you're outside the top 10.
const AXIS: Record<string, string> = { pts: 'points', s: 'seconds', kg: 'kg added (minus = assist)', '%': '% of bodyweight', mm: 'mm', wks: 'weeks' };

/** 3–5 round ticks covering lo..hi (lo ≤ 0 ≤ hi). */
function niceTicks(lo: number, hi: number) {
  const span = hi - lo || Math.abs(hi) || 1, raw = span / 4, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(st => st >= raw)!;
  const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step, out: number[] = [];
  for (let v = a; v <= b + step / 2; v += step) out.push(+v.toFixed(6));
  return out;
}
// axis ticks are short: 0 / 1K / 2K once the axis reaches 1,000 (the bars carry the exact values)
const compact = (n: number, big: boolean) => (n < 0 ? '−' : '') + (big && n !== 0 ? `${+(Math.abs(n) / 1000).toFixed(1)}K` : Number.isInteger(n) ? Math.abs(n).toLocaleString() : Math.abs(n).toFixed(1));
const label = (v: number, unit: string) => (unit === 'kg' && v > 0 ? '+' : '') + (Number.isInteger(v) ? v.toLocaleString() : v.toFixed(1)) + (unit === '%' ? '%' : '');

/** `morph`: move from the board shown now (bars resize, climbers slide to their new places, numbers count)
 *  rather than growing the bars in from nothing. */
function drawChart(rows: RankRow[], c: Category, morph = false) {
  const me = state.me?.id, el = $('#t10');
  const before = morph && !reduced() ? snapshot(el) : null;
  if (!rows.length) { el.innerHTML = ''; el.classList.remove('in', 'morph'); return; }
  const top = rows.slice(0, 10), mine = rows.find(r => r.p.id === me), pinned = mine && !top.includes(mine) ? mine : null;
  const shown = pinned ? [...top, pinned] : top;
  const avg = rows.reduce((a, r) => a + r.v, 0) / rows.length;
  const ticks = niceTicks(Math.min(0, ...shown.map(r => r.v), avg), Math.max(0, ...shown.map(r => r.v), avg));
  const d0 = ticks[0]!, d1 = ticks.at(-1)!, pos = (v: number) => ((v - d0) / (d1 - d0 || 1)) * 100, zero = pos(0);
  const tied = (r: RankRow) => rows.filter(x => x.place === r.place).length > 1;
  const grid = ticks.map(t => `<i class="gl${t === 0 ? ' zero' : ''}" style="left:${pos(t)}%"></i>`).join('') + (rows.length > 1 ? `<i class="avg" style="left:${pos(avg)}%"></i>` : '');
  const unit = c.unit, axis = AXIS[unit] ?? c.name.toLowerCase();
  const row = (r: RankRow) => {
    const p = pos(r.v), left = Math.min(zero, p), w = Math.abs(p - zero), neg = r.v < 0, you = r.p.id === me;
    const i = rows.indexOf(r), ahead = rows.slice(0, i).reverse().find(x => x.v !== r.v);
    const behind = ahead ? `${label(Math.abs(ahead.v - r.v), unit).replace('+', '')}${unit === '%' ? '' : unit ? ' ' + unit : ''} behind ${ahead.p.id === me ? 'you' : ahead.p.name}` : 'Top of the board';
    const tip = `#${r.place}${tied(r) ? '=' : ''} ${r.p.name}${you ? ' (you)' : ''} · ${fmt(r.v, unit)} · ${behind}`;
    return `<div class="t10r${you ? ' me' : ''}" data-uid="${r.p.id}" data-v="${r.v}" tabindex="0" role="listitem" aria-label="${esc(tip)}" data-tip="${esc(tip)}">
      <span class="t10p">${r.place}${tied(r) ? '=' : ''}</span>${avatar(r.p)}<span class="t10n">${you ? 'You' : esc(r.p.name)}</span>
      <span class="t10t"><span class="t10plot">${grid}<b class="t10b${neg ? ' neg' : ''}" style="left:${left}%;width:${w}%"></b><span class="t10v" style="left:${neg ? zero : p}%">${label(r.v, unit)}</span></span></span></div>`;
  };
  el.dataset.unit = unit;
  el.innerHTML = `<div role="list" aria-label="Top 10, ${esc(c.name)}">${top.map(row).join('')}${pinned ? `<div class="t10gap" aria-hidden="true">⋯</div>${row(pinned)}` : ''}</div>
    <div class="t10r t10ax" aria-hidden="true"><span></span><span></span><span></span><span class="t10t"><span class="t10plot">${ticks.map(t => `<em style="left:${pos(t)}%">${compact(t, Math.max(Math.abs(d0), Math.abs(d1)) >= 1000)}</em>`).join('')}</span></span></div>
    <div class="t10leg"><span>${esc(axis)}</span>${rows.length > 1 ? `<span><i class="avgk"></i>group average ${label(unit === 'pts' || unit === '' ? Math.round(avg) : Math.round(avg * 10) / 10, unit)}</span>` : ''}</div>`;
  hydrateIcons(el);
  el.classList.remove('in', 'morph'); void el.offsetWidth;
  if (before?.size) morphFrom(el, before, unit);
  else if (!reduced()) morphFrom(el, fromZero(el, `${zero}%`, unit), unit); // the first board: every bar grows from nothing, counting up
  else el.classList.add('in');
}
/** Every row starting where it is, with an empty bar and 0 at the zero line. */
function fromZero(el: HTMLElement, zero: string, unit: string) {
  const m = new Map<string, Was>();
  for (const r of el.querySelectorAll<HTMLElement>('.t10r[data-uid]')) m.set(r.dataset.uid!, { top: r.getBoundingClientRect().top, left: zero, width: '0%', at: zero, v: 0, unit });
  return m;
}

// ---- moving from one board to the next ----
interface Was { top: number; left: string; width: string; at: string; v: number; unit: string; }
/** Where each climber's row, bar and value are now, before the chart is redrawn. */
function snapshot(el: HTMLElement) {
  const m = new Map<string, Was>(), unit = el.dataset.unit ?? '';
  for (const r of el.querySelectorAll<HTMLElement>('.t10r[data-uid]')) {
    const b = r.querySelector<HTMLElement>('.t10b'), v = r.querySelector<HTMLElement>('.t10v');
    if (b && v && !m.has(r.dataset.uid!)) m.set(r.dataset.uid!, { top: r.getBoundingClientRect().top, left: b.style.left, width: b.style.width, at: v.style.left, v: +r.dataset.v!, unit });
  }
  return m;
}
/** Start each row where it was (place, bar, value), then let the CSS transitions carry it to where it is now.
 *  Climbers new to the top 10 fade in. */
function morphFrom(el: HTMLElement, was: Map<string, Was>, unit: string) {
  el.classList.add('morph');
  const moving: [HTMLElement, HTMLElement, HTMLElement, Was, { left: string; width: string; at: string }][] = [];
  for (const r of el.querySelectorAll<HTMLElement>('.t10r[data-uid]')) {
    const o = was.get(r.dataset.uid!), b = r.querySelector<HTMLElement>('.t10b'), v = r.querySelector<HTMLElement>('.t10v');
    if (!o || !b || !v) { r.classList.add('t10new'); continue; }
    moving.push([r, b, v, o, { left: b.style.left, width: b.style.width, at: v.style.left }]);
  }
  for (const [r, b, v, o] of moving) {
    r.style.transition = b.style.transition = v.style.transition = 'none';
    r.style.transform = `translateY(${o.top - r.getBoundingClientRect().top}px)`;
    b.style.left = o.left; b.style.width = o.width; v.style.left = o.at;
    if (o.unit === unit) countTo(v, o.v, +r.dataset.v!, x => label(x, unit));
  }
  void el.offsetWidth; // apply the starting points before moving off them
  for (const [r, b, v, , to] of moving) {
    r.style.transition = b.style.transition = v.style.transition = '';
    r.style.transform = ''; b.style.left = to.left; b.style.width = to.width; v.style.left = to.at;
  }
}
/** How long numbers take to add up, and the bars to reach their length with them (the same in app.css). */
const COUNT_MS = 1600;
/** Add a number up (or down) from what it was to what it is, steadily: a gentle start and finish, like the bars. */
function countTo(n: HTMLElement, from: number, to: number, show: (v: number) => string) {
  if (from === to || typeof requestAnimationFrame !== 'function') return;
  const whole = Number.isInteger(from) && Number.isInteger(to);
  let t0 = 0;
  const step = (t: number) => {
    if (!n.isConnected) return;
    t0 ||= t;
    const k = Math.min(1, (t - t0) / COUNT_MS), v = from + (to - from) * (1 - Math.cos(Math.PI * k)) / 2; // ease-in-out sine
    n.textContent = show(k < 1 ? (whole ? Math.round(v) : Math.round(v * 10) / 10) : to);
    if (k < 1) requestAnimationFrame(step);
  };
  n.textContent = show(from);
  requestAnimationFrame(step);
}

// ---------------- the period carousel ----------------
// The leaderboard moves on by itself through this week, this month, this season and overall, a few seconds
// each, for whatever board is picked. It waits while you're looking closely (the pointer on the chart, or a row
// focused), while it's scrolled out of view or the page is hidden, and while a sheet or tour is open. With
// reduced motion it starts paused.
const DWELL = 5000, TICK = 100;
let paused: boolean | null = null; // null until the first visit decides (reduced motion: paused)
let spinT: number | undefined, spun = 0, onScreen = true, hovering = false, seen: IntersectionObserver | null = null;
const reduced = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function startSpin() {
  clearInterval(spinT); spun = 0; hovering = false; onScreen = true;
  if (paused == null) paused = reduced();
  const card = $('#t10').closest('.t10card') as HTMLElement;
  seen?.disconnect(); seen = null;
  if (typeof IntersectionObserver === 'function') { seen = new IntersectionObserver(es => { onScreen = es.some(e => e.isIntersecting); }, { threshold: 0.4 }); seen.observe(card); }
  syncSpin();
  spinT = window.setInterval(spinTick, TICK);
}
/** Whether the carousel should be moving right now. */
function spinning(el: HTMLElement) {
  return !paused && !el.closest('.hide') && document.visibilityState !== 'hidden' && onScreen
    && !hovering && !el.contains(document.activeElement) && !document.querySelector('.modal, .tour');
}
function spinTick() {
  const el = document.getElementById('t10');
  if (!el) { clearInterval(spinT); seen?.disconnect(); return; } // the Ranks page was replaced
  if (!spinning(el)) return;
  spun += TICK;
  $('#t10spin').style.setProperty('--spun', String(Math.min(1, spun / DWELL)));
  if (spun >= DWELL) spinTo(PERIODS[(PERIODS.indexOf(period) + 1) % PERIODS.length]!);
}
/** Show another period, moving from the one shown now. */
function spinTo(p: Period) {
  period = p; spun = 0;
  hideTip(); draw(true);
}
/** The period names and play button, for what's shown now. */
function syncSpin() {
  const bar = document.getElementById('t10spin'); if (!bar) return;
  bar.style.setProperty('--spun', String(Math.min(1, spun / DWELL)));
  for (const d of bar.querySelectorAll<HTMLElement>('[data-spin]')) { const on = d.dataset.spin === period; d.classList.toggle('on', on); d.setAttribute('aria-pressed', String(on)); }
  const play = $('#t10play');
  play.innerHTML = ic(paused ? 'play' : 'pause'); play.setAttribute('aria-label', paused ? 'Play: show each period in turn' : 'Pause');
  bar.classList.toggle('paused', !!paused);
  hydrateIcons(play);
}

function wireChart() {
  $('#t10spin').addEventListener('click', e => {
    const t = e.target as HTMLElement, d = t.closest('[data-spin]') as HTMLElement | null;
    if (d) { if (d.dataset.spin !== period) spinTo(d.dataset.spin as Period); else spun = 0; return; }
    if (t.closest('#t10play')) { paused = !paused; syncSpin(); }
  });
  const wrap = $('#t10'), tip = $('#t10tip');
  // the carousel waits while the pointer's on the chart
  wrap.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') hovering = true; });
  wrap.addEventListener('pointerleave', () => { hovering = false; });
  const show = (r: HTMLElement) => {
    tip.textContent = r.dataset.tip ?? ''; tip.classList.remove('hide');
    const card = wrap.closest('.card') as HTMLElement, cb = card.getBoundingClientRect(), rb = r.getBoundingClientRect();
    tip.style.top = `${rb.top - cb.top - tip.offsetHeight - 4}px`;
  };
  wrap.addEventListener('pointerover', e => { if (e.pointerType !== 'mouse') return; const r = (e.target as HTMLElement).closest('.t10r[data-tip]') as HTMLElement | null; if (r) show(r); });
  wrap.addEventListener('pointerleave', hideTip);
  wrap.addEventListener('focusin', e => { const r = (e.target as HTMLElement).closest('.t10r[data-tip]') as HTMLElement | null; if (r) show(r); });
  wrap.addEventListener('focusout', hideTip);
  wrap.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.target as HTMLElement).matches('.t10r[data-uid]')) (e.target as HTMLElement).click(); });
}
function hideTip() { $('#t10tip')?.classList.add('hide'); }

// ---------------- streaks and progress ----------------
// Boards with their own window built in (a run of weeks, this month against last), so no period to pick.
function sideCard() {
  return `<div class="card" id="sideCard"><h3>${ic('streak')} Streaks and progress</h3>
    <div class="chips g g2" id="sideF" style="margin-top:10px">${SIDE.map(id => `<span class="chip${id === side ? ' on' : ''}" data-side="${id}" role="button" tabindex="0" aria-pressed="${id === side}">${ic(CAT(id).icon)} ${CAT(id).name}</span>`).join('')}</div>
    <p class="sub" id="sideDesc" style="margin:8px 0 4px"></p>
    <div id="sideList"></div><p class="sub" id="sideGap" style="margin-top:10px"></p></div>`;
}
function wireSide() {
  const f = $('#sideF');
  const pick = (t: EventTarget | null) => {
    const c = (t as HTMLElement | null)?.closest('[data-side]') as HTMLElement | null; if (!c || c.dataset.side === side) return;
    side = c.dataset.side!;
    for (const x of f.querySelectorAll<HTMLElement>('[data-side]')) { const on = x === c; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); }
    drawSide();
  };
  f.addEventListener('click', e => pick(e.target));
  f.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(e.target); } });
}
function drawSide() {
  const c = CAT(side), me = state.me?.id, unit = c.unit;
  const rows = rankRows(c).filter(r => side !== 'streak' || r.v > 0); // no streak, not on the streak board
  $('#sideDesc').innerHTML = `${esc(c.desc)}`;
  const top = rows.slice(0, 10), mine = rows.find(r => r.p.id === me), shown = mine && !top.includes(mine) ? [...top, mine] : top;
  const tied = (r: RankRow) => rows.filter(x => x.place === r.place).length > 1;
  $('#sideList').innerHTML = shown.map(r => `<div class="lrow ${r.p.id === me ? 'me' : ''}" data-uid="${r.p.id}"><span class="r">${r.place}${tied(r) ? '=' : ''}</span>${avatar(r.p)}<span class="nm">${esc(r.p.name)}${r.p.id === me ? ' (you)' : ''}</span><span class="pt">${fmt(r.v, unit)}</span></div>`).join('')
    || `<p class="sub" style="margin:0">${side === 'improved' ? 'No one has a result here yet: it needs a two-arm max hang this month and last.' : 'No one has a streak yet.'}</p>`;
  const mi = rows.findIndex(r => r.p.id === me), ahead = mi > 0 ? rows.slice(0, mi).reverse().find(r => r.v !== rows[mi]!.v) : undefined;
  $('#sideGap').textContent = mi < 0 ? '' : rows[mi]!.place === 1 ? "🥇 You're number one!" : ahead ? `⬆ ${fmt(Math.abs(ahead.v - rows[mi]!.v), unit).replace('+', '')} to pass ${ahead.p.name}` : '';
}

/** Past season winners, newest first. Ties share the crown. */
function hallOfChampions() {
  const by = new Map<string, typeof state.champions>();
  for (const c of state.champions) (by.get(c.seasonStart) ?? by.set(c.seasonStart, []).get(c.seasonStart)!).push(c);
  const rows = [...by.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12).map(([start, cs]) => {
    const names = cs.map(c => `<b data-uid="${c.userId}">${esc(state.profiles.get(c.userId)?.name ?? 'Former climber')}</b>`).join(' & ');
    // each winner's crown as it looked when they won this title
    return `<div class="lrow hof"><span class="hof-ic">${cs.map(c => crownSvg(c.userId, titlesOf(c.userId, start))).join('')}</span><span class="nm">${names}<small>${seasonNameFromStart(start)} champion · ${cs[0]!.points.toLocaleString()} pts</small></span></div>`;
  }).join('');
  return `<div class="card"><h3>${ic('award')} Hall of champions</h3>${rows || '<p class="sub" style="margin:0">No champions yet. The first title is decided when this season ends.</p>'}</div>`;
}
