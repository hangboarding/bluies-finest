import { $, $$, esc, sheet, bubble } from '../lib/ui';
import { ic, hydrateIcons } from '../lib/icons';
import { state, mySessions, saveSettings, achievementCtx } from '../lib/state';
import { weekStreak, bestDayRun, dayKey, weekStart, addDays, favouriteProtocol } from '../lib/scoring';
import { TIERED, ONE_OFFS, TIER_NAMES, TIER_COLOURS, tierOf } from '../lib/achievements';
import type { Session } from '../lib/types';
import { placeOf } from '../lib/leaderboard';

const DAY = 864e5, MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], DW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
let hs: 'w' | 'm' | 'q' | 'y' = 'y', ho = 0;

export function renderStats(root: HTMLElement) {
  const mine = mySessions();
  const rank = placeOf(state.me?.id); // same ranking as the Ranks page
  root.innerHTML = `
  <div class="card"><div class="stats" style="margin:0"><div class="stat"><b>${mine.length}</b>sessions</div><div class="stat"><b>${weekStreak(mine)} ${ic('streak')}</b>wk streak</div><div class="stat"><b>${rank}</b>rank</div></div>${(() => { const f = favouriteProtocol(mine); return f ? `<p class="fav">${ic('star')} Favourite protocol: <b>${esc(f.name)}</b> · ${f.count} session${f.count > 1 ? 's' : ''} (${f.pct}%)</p>` : ''; })()}</div>
  <div class="card"><h3>${ic('calendar')} Consistency</h3>
    <div class="chips g g4" id="hscale" style="margin-bottom:10px">${(['y', 'q', 'm', 'w'] as const).map(k => `<span class="chip ${hs === k ? 'on' : ''}" data-s="${k}" role="button" tabindex="0" aria-pressed="${hs === k}">${{ w: 'Week', m: 'Month', q: '3 months', y: 'Year' }[k]}</span>`).join('')}</div>
    <div class="hnav"><button id="hPrev" aria-label="Previous period">‹</button><b id="hLbl"></b><button id="hNext" aria-label="Next period">›</button></div>
    <div class="heatbox" id="heatbox"><div class="yr-wrap"><div class="ydays"><span></span><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span></div><div><div class="ymon" id="ymon"></div><div class="heat" id="heat"></div></div></div></div>
    <div class="hsum" id="hsum"></div>
    <p class="sub center" style="margin:8px 0 0;font-size:11px">Tap a day to see what you did · ← → keys change period</p></div>
  <div class="card pbs"><h3>${ic('medal')} Personal bests</h3><div id="pbs"></div></div>
  <div class="card"><div class="chart-hd">${ic('chart')}<select id="chartSel" aria-label="Chart"></select></div><div class="chart" id="chart" style="margin-top:22px"></div><br><p class="sub" id="chartNote" style="margin:4px 0 0"></p></div>
  <div class="card"><h3 class="lab">${ic('award')} Achievements · <span id="achN"></span><span class="tip" data-tip="tiers">i</span></h3><div class="ach" id="ach"></div></div>
  <details class="card panel" data-p="extras"><summary>${ic('star')} One-offs &amp; secrets<small id="secN"></small></summary><br><div class="ach" id="ach1"></div></details>`;
  const d = $<HTMLDetailsElement>('details[data-p="extras"]', root);
  d.open = !!state.settings.panels.extras;
  d.addEventListener('toggle', () => { state.settings.panels.extras = d.open; saveSettings(); });
  drawPBs(mine); drawChartSel(); drawAch(); heat();
  hydrateIcons(root);
  root.onclick = onClick;
}

// ---------- consistency ----------
function range(): [Date, number, string] {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  if (hs === 'w') { const st = addDays(weekStart(t), ho * 7), en = addDays(st, 6); return [st, 7, `${st.getDate()} ${MON[st.getMonth()]} – ${en.getDate()} ${MON[en.getMonth()]}`]; }
  if (hs === 'm') { const st = new Date(t.getFullYear(), t.getMonth() + ho, 1); return [st, new Date(st.getFullYear(), st.getMonth() + 1, 0).getDate(), `${MON[st.getMonth()]} ${st.getFullYear()}`]; }
  if (hs === 'q') { const st = new Date(t.getFullYear(), t.getMonth() - 2 + ho * 3, 1), en = new Date(st.getFullYear(), st.getMonth() + 3, 0); return [st, Math.round((+en - +st) / DAY) + 1, `${MON[st.getMonth()]} – ${MON[en.getMonth()]} ${en.getFullYear()}`]; }
  const st = new Date(t.getFullYear() + ho, 0, 1); return [st, Math.round((+new Date(st.getFullYear() + 1, 0, 1) - +st) / DAY), `${st.getFullYear()}`];
}
function byDay() { const m = new Map<string, Session[]>(); for (const s of mySessions()) { const k = dayKey(new Date(s.createdAt)); (m.get(k) ?? m.set(k, []).get(k)!).push(s); } return m; }

function heat() {
  const [st, n, lbl] = range(), h = $('#heat'), box = $('#heatbox'), today = new Date(), days = byDay();
  const lead = hs === 'w' ? 0 : (st.getDay() + 6) % 7, cols = hs === 'w' ? 7 : Math.ceil((lead + n) / 7);
  h.className = 'heat' + (hs === 'w' ? ' wk' : ''); box.className = 'heatbox' + (hs === 'y' ? ' y' : '');
  h.style.gridTemplateColumns = hs === 'y' ? '' : `repeat(${cols},1fr)`; h.style.gridTemplateRows = hs === 'w' ? '1fr' : 'repeat(7,1fr)'; h.style.gridAutoFlow = hs === 'w' ? 'row' : 'column';
  let html = '<i style="visibility:hidden"></i>'.repeat(lead), count = 0;
  const inRange = new Set<string>();
  for (let i = 0; i < n; i++) {
    const d = new Date(st.getFullYear(), st.getMonth(), st.getDate() + i), k = dayKey(d), fut = d > today, ss = days.get(k) ?? [];
    if (ss.length) { count += ss.length; inRange.add(k); }
    const lvl = Math.min(100, 45 + ss.reduce((a, s) => a + s.tutS, 0) / 3);
    html += `<i ${fut ? '' : `data-day="${k}"`} aria-label="${d.toDateString()}: ${ss.length} sessions" style="${ss.length ? `background:color-mix(in srgb,var(--acc) ${lvl}%,var(--line));` : ''}${fut ? 'opacity:.35;' : ''}">${hs === 'w' ? DW[i] + '<br>' + d.getDate() : ''}</i>`;
  }
  h.innerHTML = html; $('#hLbl').textContent = lbl; ($('#hNext') as HTMLButtonElement).disabled = ho >= 0;
  if (hs === 'y') {
    // Label a column with its month when that month starts there (using the first day of the column
    // that's inside this year, so the week of 1 Jan reads "Jan", not "Dec"), and keep labels at least
    // 3 columns apart so they never overlap.
    let m = '', last = -1, lastCol = -9;
    for (let c = 0; c < cols; c++) {
      const d = addDays(st, Math.max(0, c * 7 - lead)), mo = d.getMonth();
      const show = mo !== last && c - lastCol >= 3;
      m += `<span>${show ? MON[mo] : ''}</span>`;
      if (show) lastCol = c;
      last = mo;
    }
    $('#ymon').innerHTML = m; box.scrollLeft = ho < 0 ? 0 : box.scrollWidth;
  }
  const elapsed = Math.max(1, Math.min(n, Math.round((+today - +st) / DAY) + 1));
  $('#hsum').innerHTML = `<span><b>${count}</b> sessions</span><span><b>${(count / Math.max(1, elapsed / 7)).toFixed(1)}</b>/week</span><span>Best run <b>${bestDayRun(inRange)}</b> day${bestDayRun(inRange) === 1 ? "" : "s"}</span>`;
}
document.addEventListener('keydown', e => {
  if (!$('#heat') || document.querySelector('.modal') || ($('#view-stats')?.classList.contains('hide') ?? true) || (e.target as HTMLElement).matches?.('input,select,textarea')) return;
  if (e.key === 'ArrowLeft') { ho--; heat(); }
  if (e.key === 'ArrowRight' && ho < 0) { ho++; heat(); }
});

// ---------- PBs ----------
function drawPBs(mine: Session[]) {
  const best = <T,>(xs: T[], f: (x: T) => number) => xs.reduce<T | null>((m, x) => (m == null || f(x) > f(m) ? x : m), null);
  const hangs = mine.filter(s => s.mode === 'hang' && s.fullHangs > 0);
  const heavy = best(hangs.filter(s => s.hang <= 15), s => s.addedKg - s.assistKg);
  const edge = best(hangs.filter(s => s.assistKg === 0), s => -s.edgeMm);
  const long = best(mine.flatMap(s => s.hangs.map(h => ({ s, h }))), x => x.h.held);
  const lift = best(mine.filter(s => s.mode === 'lift'), s => s.liftKg);
  const pct = best(hangs.filter(s => s.loadPct != null && s.hang <= 15), s => s.loadPct!);
  const row = (icon: string, name: string, sub: string, v: string) => `<div class="lrow"><span>${ic(icon)}</span><span class="nm">${name}<small>${esc(sub)}</small></span><span class="pt">${v}</span></div>`;
  const rows = [
    heavy && row('add', 'Heaviest hang', `${heavy.edgeMm}mm · ${heavy.grip} · ${heavy.hang}s`, `${heavy.addedKg - heavy.assistKg >= 0 ? '+' : ''}${heavy.addedKg - heavy.assistKg} kg`),
    pct && row('bolt', 'Strength-to-weight', `${pct.edgeMm}mm · ${pct.grip}`, `${pct.loadPct}%`),
    edge && row('edge', 'Smallest edge', `${edge.addedKg ? '+' + edge.addedKg + 'kg' : 'bodyweight'} · ${edge.grip}`, `${edge.edgeMm} mm`),
    long && row('hang', 'Longest hang', `${long.s.edgeMm}mm · ${long.s.protocolName}`, `${Math.round(Number(long.h.held) || 0)} s`),
    lift && row('lift', 'Heaviest lift (no-hang)', `${lift.edgeMm}mm · ${lift.grip}`, `${lift.liftKg} kg`),
  ].filter(Boolean);
  $('#pbs').innerHTML = rows.join('') || '<p class="sub">Your bests will show up here after your first session.</p>';
}

/** One session as a list row. `actions`: Do again, Edit and Delete buttons (for my own History). */
export function sessRow(s: Session, actions = true) {
  const load = s.mode === 'lift' ? `lift ${s.liftKg}kg` : s.addedKg ? `+${s.addedKg}kg` : s.assistKg ? `−${s.assistKg}kg` : 'BW';
  const when = new Date(s.createdAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  return `<div class="lrow" data-sid="${s.id}"><span class="nm">${esc(s.protocolName)} · ${s.edgeMm}mm · ${load}${s.pendingUpload ? '<span class="pending-tag">⏳ waiting to upload</span>' : ''}<small>${when} · ${s.fullHangs}/${s.totalHangs} full · ${s.tutS}s · ${esc(s.grip)}${s.rpe ? ' · RPE ' + s.rpe : ''} · ${s.points} pts</small></span>
    ${actions ? `<button class="ed" data-again aria-label="Do this again">${ic('replay')}</button>` : ''}${actions && !s.pendingUpload ? `<button class="ed" data-ed aria-label="Edit session">${ic('edit')}</button><button class="ed" data-del aria-label="Delete session">${ic('trash')}</button>` : ''}</div>`;
}
// ---------- chart ----------
const CHARTS: Record<string, [string, string, (xs: Session[]) => number | null]> = {
  load: ['Best load (% bodyweight)', '%', xs => { const v = xs.filter(s => s.loadPct != null && s.fullHangs > 0).map(s => s.loadPct!); return v.length ? Math.max(...v) : null; }],
  added: ['Heaviest added weight', 'kg', xs => { const v = xs.filter(s => s.mode === 'hang' && s.fullHangs > 0).map(s => s.addedKg - s.assistKg); return v.length ? Math.max(...v) : null; }],
  edge: ['Smallest edge (bodyweight)', 'mm', xs => { const v = xs.filter(s => s.mode === 'hang' && s.assistKg === 0 && s.fullHangs > 0).map(s => s.edgeMm); return v.length ? Math.min(...v) : null; }],
  tut: ['Time under tension', 's', xs => xs.reduce((a, s) => a + s.tutS, 0)],
  sess: ['Sessions', '', xs => xs.length],
  lift: ['No-hang lift', 'kg', xs => { const v = xs.filter(s => s.mode === 'lift').map(s => s.liftKg); return v.length ? Math.max(...v) : null; }],
  rpe: ['Average RPE', '', xs => { const v = xs.filter(s => s.rpe).map(s => s.rpe!); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : null; }],
  pts: ['Points', '', xs => xs.reduce((a, s) => a + s.points, 0)],
};
function drawChartSel() {
  const sel = $('#chartSel') as HTMLSelectElement;
  sel.innerHTML = Object.entries(CHARTS).map(([k, c]) => `<option value="${k}">${c[0]} / week</option>`).join('');
  sel.value = state.settings.chart && CHARTS[state.settings.chart] ? state.settings.chart : 'load';
  sel.onchange = () => { state.settings.chart = sel.value; saveSettings(); chart(); };
  chart();
}
function chart() {
  const k = ($('#chartSel') as HTMLSelectElement).value, [, unit, f] = CHARTS[k]!, mine = mySessions();
  const ws = weekStart(new Date()), weeks = Array.from({ length: 8 }, (_, i) => +addDays(ws, -(7 - i) * 7));
  const vals = weeks.map(w => { const end = +addDays(w, 7); return f(mine.filter(s => { const t = +new Date(s.createdAt); return t >= w && t < end; })); });
  const nums = vals.filter((v): v is number => v != null), mx = Math.max(1, ...nums.map(Math.abs));
  $('#chart').innerHTML = vals.map((v, i) => { const d = new Date(weeks[i]!); return `<div style="height:${v == null ? 0 : Math.max(3, (Math.abs(v) / mx) * 100)}%">${v != null ? `<b>${v}${unit}</b>` : ''}<span>${d.getDate()} ${MON[d.getMonth()]}</span></div>`; }).join('');
  const first = nums[0], last = nums[nums.length - 1];
  $('#chartNote').textContent = nums.length < 2 ? 'Log a few weeks of sessions to see a trend.' : k === 'edge' ? `${first! - last! >= 0 ? '−' : '+'}${Math.abs(first! - last!)}mm over ${nums.length} weeks (lower is better)` : `${last! - first! >= 0 ? '+' : ''}${Math.round((last! - first!) * 10) / 10}${unit} over ${nums.length} weeks`;
}

// ---------- achievements ----------
function drawAch() {
  const c = achievementCtx(); let got = 0;
  $('#ach').innerHTML = TIERED.map((a, k) => {
    const v = a.value(c), lv = tierOf(v, a.thresholds, a.lower); got += lv;
    const nx = a.thresholds[lv], prev = lv ? a.thresholds[lv - 1]! : (a.lower ? a.thresholds[0]! * 1.5 : 0);
    const prog = nx == null ? 1 : v == null ? 0 : Math.max(0, Math.min(1, (a.lower ? prev - v : v - prev) / Math.abs(nx - prev)));
    const col = TIER_COLOURS[Math.max(0, lv - 1)];
    return `<div class="a ${lv ? 'got' : 'lock'}" data-a="${k}" style="--tc:${col}" role="button" tabindex="0"><b>${ic(a.icon)}</b>${lv ? `<span class="lv">${TIER_NAMES[lv - 1]}</span>` : ''}${a.name}
      <small>${nx != null ? (v == null ? `– / ${nx}` : a.lower ? `${v} → ${nx}` : `${v} / ${nx}`) : '👑 maxed'}</small>${nx != null ? `<div class="bar"><i style="width:${prog * 100}%;background:${TIER_COLOURS[lv]}"></i></div>` : ''}
      <div class="tier">${a.thresholds.map((_, j) => `<i class="${j < lv ? 'on' : ''}"></i>`).join('')}</div></div>`;
  }).join('');
  hydrateIcons($('#ach'));
  $('#achN').textContent = `${got}/${TIERED.length * 10} tiers`;
  const og = ONE_OFFS.filter(o => !o.secret && o.got(c)).length, sg = ONE_OFFS.filter(o => o.secret && o.got(c)).length;
  $('#secN').textContent = `${og}/${ONE_OFFS.filter(o => !o.secret).length} one-offs · ${sg}/${ONE_OFFS.filter(o => o.secret).length} secrets`;
  $('#ach1').innerHTML = ONE_OFFS.map((o, k) => { const g = o.got(c); return o.secret && !g
    ? `<div class="a secret" data-o="${k}" role="button" tabindex="0"><b>${ic('❓')}</b>???<small>Hidden</small></div>`
    : `<div class="a ${g ? 'got' : 'lock'}" data-o="${k}" style="--tc:${o.secret ? 'var(--blue)' : 'var(--gold)'}" role="button" tabindex="0"><b>${ic(o.icon)}</b>${o.name}<small>${g ? '✓ Unlocked' : 'Locked'}</small></div>`; }).join('');
}

function info(html: string) { sheet({ body: `<div class="ainfo">${html}</div>` }); hydrateIcons(document.querySelector(".ainfo")!); }

async function onClick(e: MouseEvent) {
  const t = e.target as HTMLElement;
  if (t.closest('.tip')) { bubble('Achievement tiers', 'Every badge climbs through 10 tiers:<br>' + TIER_NAMES.map((n, i) => `<span class="tierchip" style="--tc:${TIER_COLOURS[i]}">${i + 1}. ${n}</span>`).join('')); return; }
  const sc = t.closest('#hscale .chip') as HTMLElement | null;
  if (sc) { hs = sc.dataset.s as any; ho = 0; $$('#hscale .chip').forEach(c => c.classList.toggle('on', c === sc)); heat(); return; }
  if (t.closest('#hPrev')) { ho--; heat(); return; }
  if (t.closest('#hNext')) { if (ho < 0) { ho++; heat(); } return; }
  const day = t.closest('i[data-day]') as HTMLElement | null;
  if (day) {
    const k = day.dataset.day!, ss = byDay().get(k) ?? [], d = new Date(k + 'T12:00');
    const title = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    info(`<h2 style="font-size:18px">${title}</h2>${ss.length ? `<p class="sub">${ss.length} session${ss.length > 1 ? 's' : ''} · ${ss.reduce((a, s) => a + s.tutS, 0)}s under tension</p><div class="daysess">${ss.map(s => sessRow(s, false)).join('')}</div>` : '<div class="big-ic">😴</div><p class="sub">Rest day. Recovery counts too.</p>'}`);
    return;
  }
  const a = t.closest('.a') as HTMLElement | null;
  if (a?.dataset.a) {
    const x = TIERED[+a.dataset.a]!, c = achievementCtx(), v = x.value(c), lv = tierOf(v, x.thresholds, x.lower), nx = x.thresholds[lv];
    info(`<div class="big-ic" style="color:${lv ? TIER_COLOURS[lv - 1] : 'var(--mute)'}">${ic(x.icon)}</div><h2>${x.name}</h2><p class="sub">${x.desc}</p>
      <div style="font-weight:800;color:${lv ? TIER_COLOURS[lv - 1] : 'var(--mute)'}">${lv ? TIER_NAMES[lv - 1] : 'Not started'}${v != null ? ` · you're at ${v}` : ''}</div>
      ${nx != null ? `<p class="sub" style="margin:4px 0 12px">Next: <b style="color:${TIER_COLOURS[lv]}">${TIER_NAMES[lv]}</b> at ${x.lower ? '≤ ' : ''}${nx}${v != null ? ` (${Math.round(Math.abs(nx - v) * 10) / 10} to go)` : ''}</p>` : '<p class="sub">👑 GOAT status. Nothing left to prove.</p>'}
      <button class="linkbtn" data-tiers="${a.dataset.a}">${ic('help')} See all tier targets</button>`);
    hydrateIcons(document.querySelector('.ainfo')!);
    return;
  }
  if (a?.dataset.o) {
    const o = ONE_OFFS[+a.dataset.o]!, g = o.got(achievementCtx());
    info(o.secret && !g ? `<div class="big-ic">${ic('❓')}</div><h2>Secret achievement</h2><p class="sub">Hint: <i>${o.hint}</i></p>`
      : `<div class="big-ic" style="${g ? '' : 'filter:grayscale(1);opacity:.4'}">${ic(o.icon)}</div><h2>${o.name}</h2><p class="sub">${o.desc}</p><p style="font-weight:700">${g ? (o.secret ? '🤫 Secret found!' : '✓ Unlocked') : '🔒 Not yet'}</p>`);
    return;
  }
}
// tier targets tooltip from inside the info sheet
document.addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest('[data-tiers]') as HTMLElement | null; if (!b) return;
  const x = TIERED[+b.dataset.tiers!]!, v = x.value(achievementCtx()), lv = tierOf(v, x.thresholds, x.lower);
  bubble(`${x.name} tiers`, x.thresholds.map((th, j) => `<span class="tierchip ${j < lv ? 'done' : ''}" style="--tc:${TIER_COLOURS[j]}">${j < lv ? '✓ ' : ''}${TIER_NAMES[j]} · ${x.lower ? '≤' : ''}${th}</span>`).join(''));
});
