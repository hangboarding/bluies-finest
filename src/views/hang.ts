import { $, $$, esc, toast, confirmSheet, promptSheet, bubble, vibrate } from '../lib/ui';
import { ic, hydrateIcons } from '../lib/icons';
import { PROTOCOLS, FIELDS, DEFAULTS, TIPS, QUOTES, type Values, type Protocol } from '../lib/protocols';
import { state, saveSettings, mySessions, achievementCtx } from '../lib/state';
import { SessionTimer, buildSteps, beep, fanfare, unlockAudio, keepAwake, handsLabel, type Step } from '../lib/timer';
import { sessionPoints, loadPct } from '../lib/scoring';
import { diffUnlocks, bumpDaily } from '../lib/achievements';
import type { HangResult, NewSession } from '../lib/types';
import { confetti } from '../lib/confetti';
import { go } from '../main';

const allProtos = (): Record<string, Protocol> => ({ ...PROTOCOLS, ...state.settings.customProtos });
let cur = 'max';
let val: Values;
let timer: SessionTimer | null = null;
let editing = false;
let startedAt = 0;
let lastLog: HangResult[] = [];

const GRIPS: [string, string][] = [['Open', 'open'], ['Half crimp', 'half'], ['Full crimp', 'full'], ['Pinch', 'pinch'], ['Sloper', 'sloper']];
const FINGERS = ['All 4', 'Front 3', 'Back 3', 'Front 2', 'Middle 2', 'Back 2', 'Mono', 'Custom'];
const FEELS = ['😭', '🤕', '😫', '😴', '😐', '🙂', '💪', '🔥'];

export function renderHang(root: HTMLElement) {
  const S = state.settings;
  root.innerHTML = `
  <section id="v-setup">
    <div class="card">
      <label class="f">Protocol</label>
      <select id="proto"></select>
      <details class="panel inner" data-p="about" open><summary>${ic('about')} About this protocol<small id="aboutSum"></small></summary><div class="hint" id="protoHint"></div></details>
      <div id="modeWrap"><br><label class="f lab">${ic('mode')} Load method<span class="tip" data-tip="mode">i</span></label>
        <div class="chips g g2" data-k="mode"><span class="chip" data-v="hang">Hang (on board)</span><span class="chip" data-v="lift">No-hang (lift)</span></div></div>
    </div>
    <div class="card"><div class="params" id="params"></div></div>
    <div class="feelrow"><label class="f">${ic('feel')} Pre-session feel</label>
      <div class="chips feel g g8" data-k="feel">${FEELS.map(f => `<span class="chip" data-v="${f}" aria-label="Feeling ${f}">${ic(f)}</span>`).join('')}</div></div>
    <details class="card panel ${S.prefs.pgrip ? '' : 'hide'}" data-p="grip" open><summary>${ic('grip')} Grip<small id="gripSum"></small></summary><br>
      <label class="f">${ic('grip')} Grip type</label>
      <div class="chips g g5 tile" data-k="grip">${GRIPS.map(([n, k]) => `<span class="chip" data-v="${n}"><em>${ic(k)}</em>${n === 'Open' ? 'Open' : n}</span>`).join('')}</div>
      <br><label class="f">${ic('fingers')} Fingers</label>
      <div class="chips g g4" data-k="fing">${FINGERS.map(f => `<span class="chip" data-v="${f}">${f}</span>`).join('')}</div>
      <br><label class="f">${ic('hands')} Hands</label>
      <div class="chips g g4" data-k="hands">${(['both', 'L', 'R', 'LR'] as const).map(h => `<span class="chip" data-v="${h}">${handsLabel(h)}</span>`).join('')}</div>
    </details>
    <details class="card panel ${S.prefs.psetup ? '' : 'hide'}" data-p="setup" open><summary>${ic('board')} Setup<small id="setupSum"></small></summary><br>
      <label class="f">${ic('board')} Board</label><select id="board"></select>
      <br><br><label class="f">${ic('material')} Edge material</label>
      <div class="chips g g4" data-k="mat">${['Wood', 'Resin', 'Metal', 'Other'].map(m => `<span class="chip" data-v="${m}">${m}</span>`).join('')}</div>
      <br><label class="f">${ic('profile')} Edge profile</label>
      <div class="chips g g2" data-k="prof">${['Flat', 'Rounded'].map(m => `<span class="chip" data-v="${m}">${m}</span>`).join('')}</div>
    </details>
    <button class="big" id="start">${ic('play')} Start session</button>
    <p class="sub center" style="margin-top:8px">Your settings are remembered for next time</p>
  </section>

  <section id="v-timer" class="hide"><div class="card center">
    <div class="sub" id="tmeta"></div>
    <div class="ring" id="ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="none" stroke="var(--line)" stroke-width="6"/><circle id="arc" cx="50" cy="50" r="45" fill="none" stroke-width="6" stroke-linecap="round" stroke-dasharray="282.7"/></svg>
      <div class="t"><div><div class="p" id="ph"></div><div class="n" id="num"></div><div class="sub" id="setlbl"></div></div></div></div>
    <div class="dots" id="dots"></div>
    <button class="big letgo hide" id="letgo">${ic('open')} Let go — log time held</button>
    <div class="row"><button class="big ghost" id="pause">${ic('pause')} Pause</button><button class="big ghost" id="skip">Skip ${ic('skip')}</button></div>
    <div class="row" style="margin-top:10px"><button class="big ghost" id="edit">${ic('edit')} Edit</button><button class="big ghost danger-text" id="quit">${ic('x')} Cancel</button></div>
  </div></section>

  <section id="v-done" class="hide">
    <div class="hero"><div class="hero-ic">${ic('mountain')}</div><h2 id="cheer"></h2><p id="cheer2"></p></div>
    <div class="card">
      <div class="stats" style="margin:0"><div class="stat"><b id="sTime"></b>under tension</div><div class="stat"><b id="sSets"></b>full hangs</div><div class="stat"><b id="sPts"></b>points</div></div>
      <p class="dnote" id="res"></p>
    </div>
    <div class="card">
      <div class="rpe-hd"><span>How hard was that?</span><span id="rpeV" class="rpev"></span></div>
      <input type="range" min="1" max="10" value="7" id="rpe" class="rng" aria-label="Effort, 1 to 10">
      <div class="rpe-sc"><span>Easy</span><span>Max effort</span></div>
      <p class="dnote" id="rpeTip"></p>
      <input class="tx" id="note" maxlength="300" placeholder="Add a note for the feed (optional)" style="margin-top:12px">
    </div>
    <p class="dnote center" id="unlocks"></p>
    <button class="big" id="saveSess">Save session</button>
    <div class="links"><a data-skip>Don't save</a></div>
  </section>`;
  wireSetup(root);
  hydrateIcons(root);
}

// ---------------- setup ----------------
function protoOptions() {
  const P = allProtos(), custom = Object.keys(state.settings.customProtos);
  $('#proto').innerHTML = Object.entries(PROTOCOLS).map(([k, p]) => `<option value="${k}">${p.simple ? '⚡ ' : ''}${esc(p.n)}</option>`).join('')
    + (custom.length ? `<optgroup label="My protocols">${custom.map(k => `<option value="${k}">★ ${esc(P[k]!.n)}</option>`).join('')}</optgroup>` : '')
    + `<option value="__new">➕ Custom protocol…</option>`;
  ($('#proto') as HTMLSelectElement).value = cur;
}

function hint(p: Protocol) {
  const sr = p.reps > 1 ? `${p.sets} sets × ${p.reps} reps` : `${p.sets} hangs`;
  return `<div class="ptitle">${esc(p.n)}</div><div class="pby">${esc(p.by)}</div><div class="pdesc">${esc(p.d)}</div>
  <dl class="pinfo"><dt>Use for</dt><dd>${esc(p.use)}</dd><dt>Hang / rest</dt><dd>${p.hang}s on · ${p.rest}s off${p.setRest && p.reps > 1 ? ` · ${p.setRest}s between sets` : ''}</dd>
  <dt>Recommended</dt><dd>${sr}${p.mode === 'lift' ? ' · no-hang' : ''}${p.hands === 'LR' ? ' · each hand' : ''}</dd><dt>Intensity</dt><dd>${esc(p.int)}</dd><dt>How often</dt><dd>${esc(p.freq)}</dd><dt>Edge</dt><dd>${p.edge}mm</dd></dl>
  ${p.custom ? `<button class="big ghost danger-text small-btn" id="delProto">${ic('trash')} Delete this protocol</button>` : ''}`;
}

function drawParams() {
  $('#params').innerHTML = FIELDS.filter(f => !f.show || f.show(val)).map(f => {
    const off = (f.k === 'add' && val.rem > 0) || (f.k === 'rem' && val.add > 0);
    const label = f.k === 'rest' && val.reps > 1 ? 'Rest between reps' : f.label;
    return `<div class="prm ${off ? 'off' : ''}" style="--c:${f.colour}"><div class="hd"><span class="ic">${ic(f.icon)}</span>${label}${TIPS[f.k] ? `<span class="tip" data-tip="${f.k}">i</span>` : ''}</div>
      <div class="step"><button data-k="${f.k}" data-d="-1" aria-label="Decrease ${label}">−</button><input id="i-${f.k}" value="${val[f.k]}" inputmode="decimal" aria-label="${label}"><small>${f.unit}</small><button data-k="${f.k}" data-d="1" aria-label="Increase ${label}">+</button></div></div>`;
  }).join('');
  $('#modeWrap').classList.toggle('hide', !!val.simple);
  hydrateIcons($('#params'));
}

const chipVal = (k: string) => ($(`[data-k="${k}"] .chip.on`) as HTMLElement | null)?.dataset.v ?? '';
function setChip(k: string, v: string | undefined) {
  const g = $(`[data-k="${k}"]`); if (!g) return;
  const chips = $$('.chip', g); const hit = chips.find(c => c.dataset.v === v) ?? chips[k === 'feel' ? 5 : 0];
  chips.forEach(c => c.classList.toggle('on', c === hit));
}

/** Sensible limits per setting — stops typos (and gaming) like 0s hangs or 10,000 sets. */
const LIMITS: Record<string, [number, number]> = {
  hang: [1, 300], rest: [0, 900], sets: [1, 50], reps: [1, 30], setRest: [0, 1800], edge: [3, 60],
  add: [0, 150], rem: [0, 150], lift: [0, 200], effort: [5, 100], sw: [0, 120], ready: [0, 60],
};
function readInputs() {
  for (const f of FIELDS) {
    const i = $(`#i-${f.k}`) as HTMLInputElement | null; if (!i) continue;
    const [lo, hi] = LIMITS[f.k] ?? [0, 9999];
    const n = Math.min(hi, Math.max(lo, +String(i.value).replace(',', '.') || 0));
    const v = f.step < 1 ? Math.round(n * 2) / 2 : Math.round(n);
    (val as any)[f.k] = v;
    if (+i.value !== v) i.value = String(v);
  }
}

function summaries() {
  const b = ($('#board') as HTMLSelectElement).value;
  $('#gripSum').textContent = [chipVal('grip'), chipVal('fing'), val.hands !== 'both' ? handsLabel(val.hands) : ''].filter(Boolean).join(' · ');
  $('#setupSum').textContent = [b !== '__add' ? b : '', chipVal('mat'), chipVal('prof')].filter(Boolean).join(' · ');
  $('#aboutSum').textContent = allProtos()[cur]?.use ?? '';
}

function loadProto(k: string) {
  const P = allProtos(); if (!P[k]) k = 'max';
  const p = P[k]!; cur = k;
  val = { ...DEFAULTS, ...p, ...(state.settings.vals[k] ?? {}) } as Values;
  val.simple = !!p.simple;
  ($('#proto') as HTMLSelectElement).value = k;
  $('#protoHint').innerHTML = hint(p);
  setChip('mode', val.mode); setChip('hands', val.hands);
  drawParams(); summaries(); hydrateIcons($('#protoHint'));
}

function persist() {
  readInputs();
  val.mode = (chipVal('mode') || 'hang') as Values['mode'];
  val.hands = (chipVal('hands') || 'both') as Values['hands'];
  const p = allProtos()[cur]!, o: Record<string, any> = {};
  for (const x of ['hang', 'rest', 'sets', 'reps', 'setRest', 'edge', 'add', 'rem', 'lift', 'effort', 'sw', 'ready', 'mode', 'hands'] as const)
    if ((val as any)[x] !== undefined && (val as any)[x] !== (p as any)[x] && !(x in DEFAULTS && (val as any)[x] === (DEFAULTS as any)[x] && (p as any)[x] === undefined)) o[x] = (val as any)[x];
  const S = state.settings;
  S.vals[cur] = o; S.proto = cur;
  for (const c of ['grip', 'fing', 'mat', 'prof', 'feel']) S.chips[c] = chipVal(c);
  const b = ($('#board') as HTMLSelectElement).value; if (b && b !== '__add') S.board = b;
  saveSettings(); summaries();
}

export function drawBoards() {
  const S = state.settings, sel = $('#board') as HTMLSelectElement | null; if (!sel) return;
  const chosen = S.board && S.boards.list.includes(S.board) ? S.board : S.boards.def;
  sel.innerHTML = S.boards.list.map(b => `<option${b === chosen ? ' selected' : ''}>${esc(b)}</option>`).join('') + `<option value="__add">➕ Add board…</option>`;
}
export async function addBoard(name?: string | null) {
  const n = (name ?? await promptSheet('Add a board', 'Name it — it becomes your default for new sessions.', 'e.g. Garage board'))?.trim();
  if (!n) { drawBoards(); return; }
  const B = state.settings.boards;
  if (!B.list.includes(n)) B.list.unshift(n);
  if (!B.custom.includes(n)) B.custom.push(n);
  B.def = n; state.settings.board = n; saveSettings(); drawBoards(); summaries(); toast(`${n} saved as your default`);
}

function wireSetup(root: HTMLElement) {
  const S = state.settings;
  protoOptions(); drawBoards();
  for (const [k, v] of Object.entries(S.chips)) setChip(k, v);
  for (const k of ['grip', 'fing', 'mat', 'prof', 'feel']) if (!S.chips[k]) setChip(k, undefined);
  loadProto(S.proto);
  for (const d of $$<HTMLDetailsElement>('details[data-p]', root)) {
    const k = d.dataset.p!; if (k in S.panels) d.open = S.panels[k]!;
    d.addEventListener('toggle', () => { S.panels[k] = d.open; saveSettings(); });
  }

  $('#proto').addEventListener('change', async e => {
    const sel = e.target as HTMLSelectElement;
    if (sel.value !== '__new') { persist(); loadProto(sel.value); persist(); return; }
    sel.value = cur; persist();
    const n = await promptSheet('New protocol', 'Saves your current hang, rest, sets, edge and load settings under a name.', 'Protocol name');
    if (!n) return;
    const k = 'c_' + Date.now();
    state.settings.customProtos[k] = { n, by: `Custom — by ${state.me?.name ?? 'you'}`, use: 'Your own plan', d: 'Your saved protocol.', int: 'Your call', freq: 'Your call', custom: true,
      hang: val.hang, rest: val.rest, sets: val.sets, reps: val.reps, setRest: val.setRest, edge: val.edge, mode: val.mode, hands: val.hands, sw: val.sw, effort: val.effort };
    state.settings.vals[k] = { add: val.add, rem: val.rem, lift: val.lift, ready: val.ready };
    cur = k; protoOptions(); loadProto(k); persist(); toast(`★ ${n} saved`);
  });
  $('#protoHint').addEventListener('click', async e => {
    if (!(e.target as HTMLElement).closest('#delProto')) return;
    if (!await confirmSheet('Delete protocol?', `“${esc(allProtos()[cur]!.n)}” will be removed.`, 'Delete')) return;
    delete state.settings.customProtos[cur]; delete state.settings.vals[cur]; cur = 'max'; protoOptions(); loadProto('max'); persist();
  });

  const params = $('#params');
  params.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest('button[data-k]') as HTMLElement | null; if (!b) return;
    const f = FIELDS.find(x => x.k === b.dataset.k)!, i = $(`#i-${f.k}`) as HTMLInputElement;
    i.value = String(Math.max(0, +(+i.value + f.step * +b.dataset.d!).toFixed(1))); vibrate(8); readInputs();
    if (f.k === 'add' && val.add > 0) val.rem = 0;
    if (f.k === 'rem' && val.rem > 0) val.add = 0;
    drawParams(); persist();
  });
  params.addEventListener('change', e => {
    readInputs(); const id = (e.target as HTMLElement).id;
    if (id === 'i-add' && val.add > 0) val.rem = 0;
    if (id === 'i-rem' && val.rem > 0) val.add = 0;
    drawParams(); persist();
  });

  root.addEventListener('click', e => {
    const t = (e.target as HTMLElement);
    const tip = t.closest('.tip') as HTMLElement | null;
    if (tip && root.contains(tip)) { e.preventDefault(); const [h, b] = TIPS[tip.dataset.tip!] ?? ['', '']; bubble(h, b); return; }
    const c = t.closest('#v-setup .chip') as HTMLElement | null; if (!c) return;
    const g = c.parentElement!; $$('.chip', g).forEach(x => x.classList.toggle('on', x === c));
    readInputs(); val.mode = (chipVal('mode') || 'hang') as Values['mode']; val.hands = (chipVal('hands') || 'both') as Values['hands'];
    if (g.dataset.k === 'mode' || g.dataset.k === 'hands') drawParams();
    persist();
  });
  $('#board').addEventListener('change', e => { if ((e.target as HTMLSelectElement).value === '__add') addBoard(); else persist(); });

  $('#start').addEventListener('click', start);
  $('#pause').addEventListener('click', togglePause);
  $('#skip').addEventListener('click', () => { unlockAudio(); timer?.skip(); });
  $('#letgo').addEventListener('click', () => { if (!timer) return; unlockAudio(); beep(440, 0.3); const h = timer.letGo(); toast(`Held ${h}s — logged`); });
  $('#quit').addEventListener('click', quit);
  $('#edit').addEventListener('click', () => { if (!timer) return; timer.pause(); timer.stop(); editing = true; keepAwake(false); show('setup'); $('#start').innerHTML = `${ic('replay')} Resume with changes`; hydrateIcons($('#start')); toast('Tweak and resume — completed hangs are kept'); });
  $('#setlbl').addEventListener('click', () => { if (timer?.step.p === 'ready' && bumpDaily(state.settings.flags, 'chalk') >= 10) { state.settings.flags.chalkBucket = true; saveSettings(); } });
  $('#rpe').addEventListener('input', rpeUpd);
  $('#saveSess').addEventListener('click', saveSession);
  root.querySelector('[data-skip]')!.addEventListener('click', async () => { if (await confirmSheet("Don't save?", 'This session will be discarded.', 'Discard', 'Keep it')) { pending = null; show('setup'); } });
}

function show(which: 'setup' | 'timer' | 'done') {
  for (const k of ['setup', 'timer', 'done']) $(`#v-${k}`).classList.toggle('hide', k !== which);
  scrollTo(0, 0);
}
export const hangBusy = () => !!timer && !$('#v-timer')?.classList.contains('hide');
/** A finished session is waiting on the done screen to be saved. */
export const hangPending = () => !!pending;

// ---------------- timer ----------------
const COL: Record<Step['p'], string> = { ready: 'var(--gold)', hang: 'var(--acc)', rest: 'var(--blue)', sw: 'var(--gold)' };

function start() {
  unlockAudio(); keepAwake(true); persist();
  const resuming = editing && !!timer;
  const prevLog = resuming ? timer!.log : [];
  // Every hang already done is in the log (even across several edits), so skip that many.
  const doneHangs = prevLog.length;
  let steps = buildSteps(val);
  if (resuming && doneHangs > 0) {
    let seen = 0; const i = steps.findIndex(s => s.p === 'hang' && seen++ === doneHangs);
    if (i === -1) {
      // the edited plan has no hangs left — finish with what's been done
      editing = false; $('#start').innerHTML = `${ic('play')} Start session`; hydrateIcons($('#start'));
      timer = null; done(prevLog); return;
    }
    const lead = val.ready > 0 ? 1 : 0;
    steps = [...steps.slice(0, lead), ...steps.slice(i)];
  }
  if (!resuming) startedAt = Date.now();
  editing = false; $('#start').innerHTML = `${ic('play')} Start session`; hydrateIcons($('#start'));
  if (!steps.some(s => s.p === 'hang')) { toast('Add at least one set'); return; }
  timer?.stop();
  timer = new SessionTimer(steps, { onTick: render, onPhase: phase, onWarn: () => beep(880), onDone: done });
  timer.log = prevLog;
  const load = val.mode === 'lift' ? `lift ${val.lift}kg @ ${val.effort}%` : val.add ? `+${val.add}kg` : val.rem ? `−${val.rem}kg` : 'bodyweight';
  $('#tmeta').textContent = `${allProtos()[cur]!.n} · ${val.edge}mm ${chipVal('mat').toLowerCase()} · ${load}`;
  $('#pause').innerHTML = `${ic('pause')} Pause`; hydrateIcons($('#pause'));
  show('timer'); timer.start();
}

function phase(s: Step) {
  beep(s.p === 'hang' ? 1320 : 660, 0.35); vibrate(200);
  $('#letgo').classList.toggle('hide', s.p !== 'hang');
}
function render(s: Step, left: number) {
  const warn = s.p === 'hang' ? left <= 3 : left <= 5;
  $('#ring').className = 'ring' + (warn ? ' warn' : '');
  const ph = $('#ph'); ph.textContent = { ready: 'Get ready', hang: val.mode === 'lift' ? 'Pull!' : 'Hang!', rest: s.bigRest ? 'Set rest' : 'Rest', sw: 'Switch hands' }[s.p]; ph.style.color = COL[s.p];
  $('#num').textContent = String(left);
  $('#setlbl').textContent = s.set ? `Set ${s.set}/${val.sets}` + (val.reps > 1 ? ` · rep ${s.rep}/${val.reps}` : '') + (s.hand && s.hand !== 'both' ? ` · ${s.hand === 'L' ? 'Left' : 'Right'} hand` : '') : 'Chalk up 🧂';
  const arc = $('#arc') as unknown as SVGCircleElement; arc.style.strokeDashoffset = String(282.7 * (1 - left / Math.max(1, s.t))); arc.style.stroke = COL[s.p];
  const lastHand = val.hands === 'LR' ? 'R' : val.hands === 'both' ? 'both' : val.hands;
  // a set is done once its last rep (and last hand) has been passed
  const setsDone = timer ? (timer.steps.slice(0, timer.idx).filter(x => x.p === 'hang' && x.rep === val.reps && x.hand === lastHand).at(-1)?.set ?? 0) : 0;
  $('#dots').innerHTML = Array.from({ length: val.sets }, (_, i) => `<i class="${i < setsDone ? 'd' : i === setsDone && s.p === 'hang' ? 'c' : ''}"></i>`).join('');
}
function togglePause() {
  if (!timer) return;
  unlockAudio();
  if (timer.paused) { timer.resume(); if (timer.maxPauseMs >= 30 * 60e3) { state.settings.flags.slowBurn = true; saveSettings(); } }
  else timer.pause();
  $('#pause').innerHTML = timer.paused ? `${ic('play')} Resume` : `${ic('pause')} Pause`; hydrateIcons($('#pause'));
}
async function quit() {
  if (!timer) return;
  const wasPaused = timer.paused; timer.pause(); togglePauseLabel();
  if (await confirmSheet('Cancel session?', "This session won't be saved or count toward the leaderboard.", 'Give up 🏳️', 'Hang in there 💪')) {
    if (Date.now() - startedAt < 10_000) { state.settings.flags.dramaticExit = true; saveSettings(); }
    timer.stop(); timer = null; keepAwake(false); show('setup'); toast('Session cancelled');
  } else if (!wasPaused) { timer.resume(); togglePauseLabel(); }
}
function togglePauseLabel() { if (timer) { $('#pause').innerHTML = timer.paused ? `${ic('play')} Resume` : `${ic('pause')} Pause`; hydrateIcons($('#pause')); } }

// ---------------- done ----------------
const RW = ['', 'Very easy', 'Easy', 'Easy', 'Moderate', 'Moderate', 'Hard', 'Hard', 'Very hard', 'Very hard', 'Max'];
function rpeUpd() {
  const n = +($('#rpe') as HTMLInputElement).value;
  $('#rpeV').innerHTML = `<small>${RW[n]}</small><b>${n}</b>`;
  $('#rpeTip').textContent = n <= 5 ? "Felt easy — we'll suggest +2.5kg next time." : n <= 8 ? 'Right in the zone. Same load next time.' : "Very hard — we'll suggest backing off 2.5kg.";
}

let pending: NewSession | null = null;
function done(log: HangResult[]) {
  timer = null; keepAwake(false); lastLog = log;
  const q = QUOTES[Math.floor(Math.random() * QUOTES.length)]!;
  const tut = log.reduce((a, h) => a + h.held, 0), full = log.filter(h => h.full).length, short = log.filter(h => !h.full);
  const bw = state.priv.bodyweightKg;
  const lp = val.mode === 'lift' ? null : loadPct(bw, val.add, val.rem);
  const mine = mySessions();
  // A PB only counts against genuinely comparable sessions: same mode, edge, hands
  // (one-arm vs two) and a similar hang length (within ±3s).
  const comparable = mine.filter(s => s.mode === val.mode && s.edgeMm === val.edge && s.fullHangs > 0
    && (s.hands === 'both') === (val.hands === 'both') && Math.abs(s.hang - val.hang) <= 3
    && (val.mode === 'lift' || s.loadPct != null)); // sessions logged before bodyweight was set can't be compared
  const isPb = full > 0 && comparable.length > 0 && (val.mode === 'lift'
    ? comparable.every(s => s.liftKg < val.lift)
    : lp != null && comparable.every(s => (s.loadPct ?? 0) < lp));
  pending = {
    protocolKey: cur, protocolName: allProtos()[cur]!.n, mode: val.mode, hang: val.hang, rest: val.rest, sets: val.sets, reps: val.reps, setRest: val.setRest,
    edgeMm: val.edge, addedKg: val.mode === 'lift' ? 0 : val.add, assistKg: val.mode === 'lift' ? 0 : val.rem, liftKg: val.mode === 'lift' ? val.lift : 0, effortPct: val.effort,
    hands: val.hands, grip: chipVal('grip'), fingers: chipVal('fing'), board: ($('#board') as HTMLSelectElement).value, edgeMaterial: chipVal('mat'), edgeProfile: chipVal('prof'),
    feel: chipVal('feel'), rpe: 7, tutS: tut, fullHangs: full, totalHangs: log.length, hangs: log, loadPct: lp, isPb, note: '', points: 0,
  };
  pending.points = sessionPoints(pending);
  $('#cheer').textContent = q[0]; $('#cheer2').textContent = q[1];
  $('#sTime').textContent = tut + 's'; $('#sSets').textContent = `${full}/${log.length}`; $('#sPts').textContent = '+' + pending.points;
  const lr = (h: 'L' | 'R') => log.filter(x => x.hand === h).reduce((a, x) => a + x.held, 0);
  $('#res').textContent = (short.length ? `${short.length} cut short (${short.map(x => x.held + 's').join(', ')})` : '✓ Every hang held full time')
    + (val.hands === 'LR' ? ` · Left ${lr('L')}s / Right ${lr('R')}s` : '') + (isPb ? ' · 🏅 New personal best!' : '')
    + (bw == null && val.mode !== 'lift' ? ' · Add your bodyweight in Profile for fairer scoring' : '');
  const unlocked = diffUnlocks(achievementCtx(), achievementCtx([{ ...pending, id: 'x', userId: '', createdAt: new Date().toISOString() } as any, ...mine]));
  $('#unlocks').innerHTML = unlocked.length ? 'Unlocked: ' + unlocked.map(u => `<span class="unl">${ic(u.icon)} ${esc(u.text)}</span>`).join(' &nbsp;·&nbsp; ') : ''; hydrateIcons($('#unlocks'));
  ($('#rpe') as HTMLInputElement).value = '7'; rpeUpd(); ($('#note') as HTMLInputElement).value = '';
  show('done'); fanfare(); vibrate([100, 50, 100, 50, 300]); confetti();
}

async function saveSession() {
  if (!pending) return;
  const btn = $('#saveSess') as HTMLButtonElement; btn.disabled = true;
  try {
    pending.rpe = +($('#rpe') as HTMLInputElement).value;
    pending.note = ($('#note') as HTMLInputElement).value.trim();
    const s = await state.store.addSession(pending);
    state.sessions.unshift(s); pending = null;
    toast('Session saved'); show('setup'); go('stats');
  } catch (e: any) { toast(e.message ?? 'Could not save — try again'); }
  finally { btn.disabled = false; }
}
export const lastHangLog = () => lastLog;
