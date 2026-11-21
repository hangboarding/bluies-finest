import { $, esc, avatar } from '../lib/ui';
import { ic, hydrateIcons } from '../lib/icons';
import { CATEGORIES } from '../lib/scoring';
import { state, saveSettings, RECENT_DAYS } from '../lib/state';
import { bumpDaily } from '../lib/achievements';
import { seasonOf, daysLeft, seasonNameFromStart } from '../lib/seasons';

let cat = 'season';

export function renderRanks(root: HTMLElement) {
  const F = state.settings.flags, peeks = bumpDaily(F, 'peek');
  if (peeks >= 20 && !F.peepingTom) { F.peepingTom = true; saveSettings(); }
  else if (peeks % 5 === 0) saveSettings(); // persist the counter occasionally, not on every visit
  const groups = ['Season', ...new Set(CATEGORIES.map(c => c.group).filter(g => g !== 'Season'))];
  root.innerHTML = `<div class="card">
    <label class="f">Category</label>
    <select class="catsel" id="cats">${groups.map(g => `<optgroup label="${g}">${CATEGORIES.filter(c => c.group === g).map(c => `<option value="${c.id}"${c.id === cat ? ' selected' : ''}>${c.name}</option>`).join('')}</optgroup>`).join('')}</select>
    <p class="sub" id="catDesc" style="margin:6px 0 0"></p>
    <div class="podium" id="podium"></div><div class="champ" id="champ"></div><br>
    <div id="lbList"></div><p class="sub" style="margin-top:12px" id="gap"></p>
  </div>
  ${hallOfChampions()}
  <p class="sub center" style="font-size:12px">Tap anyone to see their profile. Seasons: Summer Dec–Feb, Autumn Mar–May, Winter Jun–Aug, Spring Sep–Nov. Other boards cover the last 90 days. Overall = points from the last 28 days + 15 per week of streak. Session points reward time under tension, heavier load (as % bodyweight), smaller edges, full hangs and PBs.</p>`;
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
  // Everyone is ranked on the same window (my own older history is loaded too, but mustn't count).
  const cutoff = Math.min(+now - RECENT_DAYS * 864e5, +seasonOf(now).start), pool = state.sessions.filter(s => +new Date(s.createdAt) >= cutoff && !s.pendingUpload);
  const by = new Map<string, typeof state.sessions>();
  for (const s of pool) (by.get(s.userId) ?? by.set(s.userId, []).get(s.userId)!).push(s);
  const rows = [...state.profiles.values()].map(p => ({ p, v: c.value(by.get(p.id) ?? [], pool, now) }))
    .filter(r => r.v != null && ((c.id !== 'overall' && c.id !== 'season') || (by.get(r.p.id)?.length ?? 0) > 0))
    .sort((a, b) => (c.lower ? a.v! - b.v! : b.v! - a.v!));
  const se = seasonOf(now), left = daysLeft(se, now);
  $('#catDesc').innerHTML = c.id === 'season'
    ? `${ic('crown')} <b>${se.name}</b> · ${left ? `${left + 1} days left` : 'last day!'} — most points wins the season`
    : `${ic(c.icon)} ${esc(c.desc)}`;
  const me = state.me?.id;
  const nm = (r: (typeof rows)[0]) => esc(r.p.name) + (r.p.id === me ? ' (you)' : '');
  const pod = (r: (typeof rows)[0] | undefined, k: 1 | 2 | 3) => r ? `<div class="pod p${k}" data-uid="${r.p.id}">${k === 1 ? `<span class="crown">${ic('crown')}</span>` : ''}${avatar(r.p, 'ph')}<b>${nm(r)}</b>
      <div class="sub pv">${fmt(r.v!, c.unit)}</div><div class="blk">${k}</div></div>` : `<div class="pod p${k}"></div>`;
  $('#podium').innerHTML = rows.length ? pod(rows[1], 2) + pod(rows[0], 1) + pod(rows[2], 3) : '';
  $('#champ').innerHTML = rows[0] ? `${ic('crown')} ${rows[0].p.id === me ? 'You rule' : esc(rows[0].p.name) + ' rules'} ${c.name.toLowerCase()} — ${fmt(rows[0].v!, c.unit)}` : 'No one has a result here yet. Be the first!';
  hydrateIcons($('#podium')); hydrateIcons($('#champ'));
  $('#lbList').innerHTML = rows.slice(3).map((r, i) => `<div class="lrow ${r.p.id === me ? 'me' : ''}" data-uid="${r.p.id}"><span class="r">${i + 4}</span>${avatar(r.p)}<span class="nm">${nm(r)}</span><span class="pt">${fmt(r.v!, c.unit)}</span></div>`).join('');
  const mi = rows.findIndex(r => r.p.id === me);
  $('#gap').textContent = mi === 0 ? "🥇 You're number one!" : mi > 0 ? `⬆ ${fmt(Math.abs(rows[mi - 1]!.v! - rows[mi]!.v!), c.unit).replace('+', '')} to pass ${rows[mi - 1]!.p.name}` : 'Log a session to get on this board.';
  hydrateIcons($('#catDesc'));
}

/** Past season winners, newest first. Ties share the crown. */
function hallOfChampions() {
  const by = new Map<string, typeof state.champions>();
  for (const c of state.champions) (by.get(c.seasonStart) ?? by.set(c.seasonStart, []).get(c.seasonStart)!).push(c);
  const rows = [...by.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12).map(([start, cs]) => {
    const names = cs.map(c => `<b data-uid="${c.userId}">${esc(state.profiles.get(c.userId)?.name ?? 'Former climber')}</b>`).join(' & ');
    return `<div class="lrow hof"><span class="hof-ic">${ic('crown')}</span><span class="nm">${names}<small>${seasonNameFromStart(start)} champion · ${cs[0]!.points.toLocaleString()} pts</small></span></div>`;
  }).join('');
  return `<div class="card"><h3>${ic('award')} Hall of champions</h3>${rows || '<p class="sub" style="margin:0">No champions yet — the first title is decided when this season ends.</p>'}</div>`;
}
