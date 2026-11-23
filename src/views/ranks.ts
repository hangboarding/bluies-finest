import { $, esc, avatar } from '../lib/ui';
import { ic, hydrateIcons } from '../lib/icons';
import { CATEGORIES } from '../lib/scoring';
import { state, saveSettings } from '../lib/state';
import { rankRows, type RankRow } from '../lib/leaderboard';
import { bumpDaily } from '../lib/achievements';
import { seasonOf, daysLeft, seasonNameFromStart } from '../lib/seasons';
import { crownSvg, titlesOf } from '../lib/crown';
import { myChampCard } from './champ-hero';

let cat = 'season';

export function renderRanks(root: HTMLElement) {
  const F = state.settings.flags, peeks = bumpDaily(F, 'peek');
  if (peeks >= 20 && !F.peepingTom) { F.peepingTom = true; saveSettings(); }
  else if (peeks % 5 === 0) saveSettings(); // persist the counter occasionally, not on every visit
  const groups = ['Season', ...new Set(CATEGORIES.map(c => c.group).filter(g => g !== 'Season'))];
  root.innerHTML = `${myChampCard()}<div class="card">
    <label class="f">Category</label>
    <select class="catsel" id="cats">${groups.map(g => `<optgroup label="${g}">${CATEGORIES.filter(c => c.group === g).map(c => `<option value="${c.id}"${c.id === cat ? ' selected' : ''}>${c.name}</option>`).join('')}</optgroup>`).join('')}</select>
    <p class="sub" id="catDesc" style="margin:6px 0 0"></p>
    <div class="podium" id="podium"></div><div class="champ" id="champ"></div><br>
    <div id="lbList"></div><p class="sub" style="margin-top:12px" id="gap"></p>
  </div>
  ${hallOfChampions()}
  <p class="sub center" style="font-size:12px">Tap anyone to see their profile. Seasons: Summer Dec–Feb, Autumn Mar–May, Winter Jun–Aug, Spring Sep–Nov. Other boards cover the last 90 days. Overall = points from the last 28 days + 15 per week of streak. Session points reward time under tension, heavier load (as % bodyweight, and heavier counts for more), one-arm hangs, smaller edges, holding hangs full time and PBs. Long easy sessions count, but each extra minute counts a little less.</p>`;
  $('#cats').addEventListener('change', e => { cat = (e.target as HTMLSelectElement).value; draw(); });
  hydrateIcons(root);
  draw();
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
