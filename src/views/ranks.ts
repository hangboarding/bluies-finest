import { $, esc, avatar } from '../lib/ui';
import { ic, hydrateIcons } from '../lib/icons';
import { CATEGORIES } from '../lib/scoring';
import { state, saveSettings } from '../lib/state';
import { bumpDaily } from '../lib/achievements';

let cat = 'overall';

export function renderRanks(root: HTMLElement) {
  const F = state.settings.flags, peeks = bumpDaily(F, 'peek');
  if (peeks >= 20 && !F.peepingTom) { F.peepingTom = true; saveSettings(); }
  else if (peeks % 5 === 0) saveSettings(); // persist the counter occasionally, not on every visit
  const groups = [...new Set(CATEGORIES.map(c => c.group))];
  root.innerHTML = `<div class="card">
    <label class="f">Category</label>
    <select class="catsel" id="cats">${groups.map(g => `<optgroup label="${g}">${CATEGORIES.filter(c => c.group === g).map(c => `<option value="${c.id}"${c.id === cat ? ' selected' : ''}>${c.name}</option>`).join('')}</optgroup>`).join('')}</select>
    <p class="sub" id="catDesc" style="margin:6px 0 0"></p>
    <div class="podium" id="podium"></div><div class="champ" id="champ"></div><br>
    <div id="lbList"></div><p class="sub" style="margin-top:12px" id="gap"></p>
  </div>
  <p class="sub center" style="font-size:12px">How Overall works: points from the last 28 days + 15 per week of streak. Session points reward time under tension, heavier load (as % bodyweight), smaller edges, full hangs and PBs.</p>`;
  $('#cats').addEventListener('change', e => { cat = (e.target as HTMLSelectElement).value; draw(); });
  draw();
}

function fmt(v: number, unit: string) {
  const n = Number.isInteger(v) ? v.toLocaleString() : v.toFixed(1);
  return unit === '%' ? `${n}%` : unit === 'kg' ? `${v > 0 ? '+' : ''}${n} kg` : unit ? `${n} ${unit}` : n;
}

function draw() {
  const c = CATEGORIES.find(x => x.id === cat)!, now = new Date();
  const by = new Map<string, typeof state.sessions>();
  for (const s of state.sessions) (by.get(s.userId) ?? by.set(s.userId, []).get(s.userId)!).push(s);
  const rows = [...state.profiles.values()].map(p => ({ p, v: c.value(by.get(p.id) ?? [], state.sessions, now) }))
    .filter(r => r.v != null && (c.id !== 'overall' || (by.get(r.p.id)?.length ?? 0) > 0))
    .sort((a, b) => (c.lower ? a.v! - b.v! : b.v! - a.v!));
  $('#catDesc').innerHTML = `${ic(c.icon)} ${esc(c.desc)}`;
  const me = state.me?.id;
  const nm = (r: (typeof rows)[0]) => esc(r.p.name) + (r.p.id === me ? ' (you)' : '');
  const pod = (r: (typeof rows)[0] | undefined, k: 1 | 2 | 3) => r ? `<div class="pod p${k}">${k === 1 ? `<span class="crown">${ic('crown')}</span>` : ''}${avatar(r.p, 'ph')}<b>${nm(r)}</b>
      <div class="sub pv">${fmt(r.v!, c.unit)}</div><div class="blk">${k}</div></div>` : `<div class="pod p${k}"></div>`;
  $('#podium').innerHTML = rows.length ? pod(rows[1], 2) + pod(rows[0], 1) + pod(rows[2], 3) : '';
  $('#champ').innerHTML = rows[0] ? `${ic('crown')} ${rows[0].p.id === me ? 'You rule' : esc(rows[0].p.name) + ' rules'} ${c.name.toLowerCase()} — ${fmt(rows[0].v!, c.unit)}` : 'No one has a result here yet. Be the first!';
  hydrateIcons($('#podium')); hydrateIcons($('#champ'));
  $('#lbList').innerHTML = rows.slice(3).map((r, i) => `<div class="lrow ${r.p.id === me ? 'me' : ''}"><span class="r">${i + 4}</span>${avatar(r.p)}<span class="nm">${nm(r)}</span><span class="pt">${fmt(r.v!, c.unit)}</span></div>`).join('');
  const mi = rows.findIndex(r => r.p.id === me);
  $('#gap').textContent = mi === 0 ? "🥇 You're number one!" : mi > 0 ? `⬆ ${fmt(Math.abs(rows[mi - 1]!.v! - rows[mi]!.v!), c.unit).replace('+', '')} to pass ${rows[mi - 1]!.p.name}` : 'Log a session to get on this board.';
  hydrateIcons($('#catDesc'));
}
