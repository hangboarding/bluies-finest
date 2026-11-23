import { $, esc, avatar } from '../lib/ui';
import { ic, hydrateIcons } from '../lib/icons';
import { CATEGORIES } from '../lib/scoring';
import { state, saveSettings } from '../lib/state';
import { rankRows, type RankRow } from '../lib/leaderboard';
import { bumpDaily } from '../lib/achievements';
import { seasonOf, daysLeft, seasonNameFromStart } from '../lib/seasons';
import { crownSvg, titlesOf } from '../lib/crown';
import { myChampCard } from './champ-hero';
import { checkUnlocks } from './unlocks';

let cat = 'season', chartCat = 'season';

const GROUPS = () => [...new Set(CATEGORIES.map(c => c.group))];
// points boards read shortest to longest period; Overall (28 days + streak) last
const ORDER = ['week', 'month', 'season', 'overall'], rank = (id: string) => { const i = ORDER.indexOf(id); return i < 0 ? 99 : i; };
const catOptions = (sel: string) => GROUPS().map(g => `<optgroup label="${g}">${CATEGORIES.filter(c => c.group === g).sort((a, b) => rank(a.id) - rank(b.id)).map(c => `<option value="${c.id}"${c.id === sel ? ' selected' : ''}>${c.name}</option>`).join('')}</optgroup>`).join('');

export function renderRanks(root: HTMLElement) {
  const F = state.settings.flags, peeks = bumpDaily(F, 'peek');
  if (peeks >= 20 && !F.peepingTom) { F.peepingTom = true; saveSettings(); checkUnlocks(); }
  else if (peeks % 5 === 0) saveSettings(); // persist the counter occasionally, not on every visit
  root.innerHTML = `${myChampCard()}<div class="card">
    <label class="f">Category</label>
    <select class="catsel" id="cats">${catOptions(cat)}</select>
    <p class="sub" id="catDesc" style="margin:6px 0 0"></p>
    <div class="podium" id="podium"></div><div class="champ" id="champ"></div><br>
    <div id="lbList"></div><p class="sub" style="margin-top:12px" id="gap"></p>
  </div>
  ${chartCard()}
  ${hallOfChampions()}
  <p class="sub center" style="font-size:12px">Tap anyone to see their profile. Seasons: Summer Dec–Feb, Autumn Mar–May, Winter Jun–Aug, Spring Sep–Nov. Other boards cover the last 90 days. Overall = points from the last 28 days + 15 per week of streak (a week with training on 2+ days). Points reward time under tension, heavier load (as % of bodyweight: heavier counts for clearly more), smaller edges, holding hangs full time and PBs. One-arm hangs count each arm, so left + right at bodyweight scores like a two-arm hang at +100%. Points are counted per day: more training always earns more, each extra minute a little less, and splitting it into lots of short sessions earns nothing extra.</p>`;
  $('#cats').addEventListener('change', e => { cat = (e.target as HTMLSelectElement).value; draw(); });
  wireChart();
  hydrateIcons(root);
  draw(); drawChart();
}

function fmt(v: number, unit: string) {
  const n = Number.isInteger(v) ? v.toLocaleString() : v.toFixed(1);
  return unit === '%' ? `${n}%` : unit === 'kg' ? `${v > 0 ? '+' : ''}${n} kg` : unit ? `${n} ${unit}` : n;
}

function draw() {
  const c = CATEGORIES.find(x => x.id === cat)!, now = new Date();
  const rows = rankRows(c, now);
  const se = seasonOf(now), left = daysLeft(se, now);
  $('#catDesc').innerHTML = c.id === 'season'
    ? `${ic('crown')} <b>${se.name}</b> · ${left ? `${left + 1} days left` : 'last day!'}. Most points wins the season`
    : `${ic(c.icon)} ${esc(c.desc)}`;
  const me = state.me?.id;
  const nm = (r: RankRow) => esc(r.p.name) + (r.p.id === me ? ' (you)' : '');
  const pod = (r: RankRow | undefined, k: 1 | 2 | 3) => r ? `<div class="pod p${k}" data-uid="${r.p.id}">${r.place === 1 ? `<span class="crown">${crownSvg(r.p.id)}</span>` : ''}${avatar(r.p, 'ph')}<b>${nm(r)}</b>
      <div class="sub pv">${fmt(r.v, c.unit)}</div><div class="blk">${k}</div></div>` : `<div class="pod p${k}"></div>`;
  $('#podium').innerHTML = rows.length ? pod(rows[1], 2) + pod(rows[0], 1) + pod(rows[2], 3) : '';
  const top = rows.filter(r => r.place === 1);
  $('#champ').innerHTML = !rows[0] ? 'No one has a result here yet. Be the first!'
    : top.length > 1 ? `${ic('crown')} ${top.map(r => r.p.id === me ? 'You' : esc(r.p.name)).join(' & ')} share ${c.name.toLowerCase()} with ${fmt(rows[0].v, c.unit)}`
    : `${ic('crown')} ${rows[0].p.id === me ? 'You rule' : esc(rows[0].p.name) + ' rules'} ${c.name.toLowerCase()} with ${fmt(rows[0].v, c.unit)}`;
  hydrateIcons($('#podium')); hydrateIcons($('#champ'));
  $('#lbList').innerHTML = rows.slice(3).map(r => `<div class="lrow ${r.p.id === me ? 'me' : ''}" data-uid="${r.p.id}"><span class="r">${r.place}</span>${avatar(r.p)}<span class="nm">${nm(r)}</span><span class="pt">${fmt(r.v, c.unit)}</span></div>`).join('');
  const mi = rows.findIndex(r => r.p.id === me);
  const ahead = mi > 0 ? rows.slice(0, mi).reverse().find(r => r.v !== rows[mi]!.v) : undefined; // first one actually ahead of me
  $('#gap').textContent = mi < 0 ? 'Log a session to get on this board.'
    : rows[mi]!.place === 1 ? (top.length > 1 ? '🥇 Tied for number one!' : "🥇 You're number one!")
    : ahead ? `⬆ ${fmt(Math.abs(ahead.v - rows[mi]!.v), c.unit).replace('+', '')} to pass ${ahead.p.name}` : '';
  hydrateIcons($('#catDesc'));
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

// ---------------- Top 10 bar chart ----------------
// One series (horizontal bars from a zero baseline), so one hue; your own bar is a darker step
// and is labelled "You", so it never relies on colour alone. Values sit at the bar tips, the dashed
// line is the whole group's average, and you're pinned underneath if you're outside the top 10.
const AXIS: Record<string, string> = { pts: 'points', s: 'seconds', kg: 'kg added (minus = assist)', '%': '% of bodyweight', mm: 'mm', wks: 'weeks' };

function chartCard() {
  return `<div class="card t10card">
    <div class="t10hd"><h3>${ic('top10')} Top 10</h3><select id="t10cat" class="t10sel" aria-label="Top 10 by">${catOptions(chartCat)}</select></div>
    <p class="sub t10note" id="t10note"></p>
    <div class="t10" id="t10"></div>
    <div class="t10tip hide" id="t10tip" role="tooltip"></div>
  </div>`;
}

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

function drawChart() {
  const c = CATEGORIES.find(x => x.id === chartCat)!, rows = rankRows(c, new Date()), me = state.me?.id;
  const el = $('#t10'), note = $('#t10note');
  if (!rows.length) { el.innerHTML = '<p class="sub" style="margin:8px 0 0">No one is on this board yet.</p>'; note.textContent = c.desc; return; }
  const top = rows.slice(0, 10), mine = rows.find(r => r.p.id === me), pinned = mine && !top.includes(mine) ? mine : null;
  const shown = pinned ? [...top, pinned] : top;
  const avg = rows.reduce((a, r) => a + r.v, 0) / rows.length;
  const ticks = niceTicks(Math.min(0, ...shown.map(r => r.v), avg), Math.max(0, ...shown.map(r => r.v), avg));
  const d0 = ticks[0]!, d1 = ticks.at(-1)!, pos = (v: number) => ((v - d0) / (d1 - d0 || 1)) * 100, zero = pos(0);
  const tied = (r: RankRow) => rows.filter(x => x.place === r.place).length > 1;
  const grid = ticks.map(t => `<i class="gl${t === 0 ? ' zero' : ''}" style="left:${pos(t)}%"></i>`).join('') + (rows.length > 1 ? `<i class="avg" style="left:${pos(avg)}%"></i>` : '');
  const unit = c.unit, axis = c.id === 'improved' ? '% better than last month' : AXIS[unit] ?? c.name.toLowerCase();
  const row = (r: RankRow) => {
    const p = pos(r.v), left = Math.min(zero, p), w = Math.abs(p - zero), neg = r.v < 0, you = r.p.id === me;
    const i = rows.indexOf(r), ahead = rows.slice(0, i).reverse().find(x => x.v !== r.v);
    const behind = ahead ? `${label(Math.abs(ahead.v - r.v), unit).replace('+', '')}${unit === '%' ? '' : unit ? ' ' + unit : ''} behind ${ahead.p.id === me ? 'you' : ahead.p.name}` : 'Top of the board';
    const tip = `#${r.place}${tied(r) ? '=' : ''} ${r.p.name}${you ? ' (you)' : ''} · ${fmt(r.v, unit)} · ${behind}`;
    return `<div class="t10r${you ? ' me' : ''}" data-uid="${r.p.id}" tabindex="0" role="listitem" aria-label="${esc(tip)}" data-tip="${esc(tip)}">
      <span class="t10p">${r.place}${tied(r) ? '=' : ''}</span>${avatar(r.p)}<span class="t10n">${you ? 'You' : esc(r.p.name)}</span>
      <span class="t10t"><span class="t10plot">${grid}<b class="t10b${neg ? ' neg' : ''}" style="left:${left}%;width:${w}%"></b><span class="t10v" style="left:${neg ? zero : p}%">${label(r.v, unit)}</span></span></span></div>`;
  };
  el.innerHTML = `<div role="list" aria-label="Top 10, ${esc(c.name)}">${top.map(row).join('')}${pinned ? `<div class="t10gap" aria-hidden="true">⋯</div>${row(pinned)}` : ''}</div>
    <div class="t10r t10ax" aria-hidden="true"><span></span><span></span><span></span><span class="t10t"><span class="t10plot">${ticks.map(t => `<em style="left:${pos(t)}%">${compact(t, Math.max(Math.abs(d0), Math.abs(d1)) >= 1000)}</em>`).join('')}</span></span></div>
    <div class="t10leg"><span>${esc(axis)}</span>${rows.length > 1 ? `<span><i class="avgk"></i>group average ${label(unit === 'pts' || unit === '' ? Math.round(avg) : Math.round(avg * 10) / 10, unit)}</span>` : ''}</div>`;
  note.textContent = c.desc + (c.lower ? '. Shorter is better.' : '');
  hydrateIcons(el);
  // grow the bars in (CSS skips this for reduced motion)
  el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
}

function wireChart() {
  $('#t10cat').addEventListener('change', e => { chartCat = (e.target as HTMLSelectElement).value; hideTip(); drawChart(); });
  const wrap = $('#t10'), tip = $('#t10tip');
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
