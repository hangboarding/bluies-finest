import { $, $$, esc, toast, sheet, confirmSheet, promptSheet, bubble, vibrate, closeSheet, onSwipe, slideIn, pickAllOnFocus } from '../lib/ui';
import { ic, hydrateIcons } from '../lib/icons';
import { PROTOCOLS, FIELDS, DEFAULTS, TIPS, QUOTES, MAX_EFFORT, LIMITS, GRIPS, FINGERS, MATERIALS, PROFILES, FEELS, RPE_WORDS as RW, TITLE_MAX, personalVals, type Values, type Protocol } from '../lib/protocols';
import { state, saveSettings, mySessions, achievementCtx, allProtos } from '../lib/state';
import { SessionTimer, buildSteps, beep, fanfare, unlockAudio, keepAwake, handsLabel, type Step } from '../lib/timer';
import { sessionPoints, loadPct, liftPct, rescoreDay, scoringDay } from '../lib/scoring';
import { diffUnlocks, bumpDaily } from '../lib/achievements';
import type { HangResult, NewSession, Session } from '../lib/types';
import { confetti } from '../lib/confetti';
import { saveOrQueue, newSessionId } from '../lib/outbox';
import { go } from '../main';
import { seasonOf } from '../lib/seasons';
import deceiveFace from '../assets/deceive.webp';
import { type Workout, blockValues, readyFor, sanitizeVals, hangCount, loadAdjust, makeBlock, cloneWorkout, blockLine, protoValues, newId, MAX_BLOCKS } from '../lib/workouts';
import { protoLabel, drawQueue, libWorkouts, findWorkout, upsertWorkout, totalsLine, customOption, newCustomExercise, deleteCustomProto, setSessionActiveCheck } from './workout-parts';
import { openBuilder } from './workouts';
import { checkUnlocks } from './unlocks';
let cur = 'max';
let val: Values;
let timer: SessionTimer | null = null;
let editing = false;
let startedAt = 0;


export function renderHang(root: HTMLElement) {
  const S = state.settings;
  root.innerHTML = `
  <section id="v-setup">
    <div class="seg" id="hangMode" role="group" aria-label="What to do"><button type="button" data-m="single">${ic('hang')} Single session</button><button type="button" data-m="workout">${ic('workouts')} Workout</button></div>
    <div class="card runnote hide" id="runNote"></div>
    <div class="card hide" id="wkCard">
      <label class="f">Workout</label>
      <button type="button" class="protobtn" id="wkBtn" aria-haspopup="dialog"><span><b id="wkName"></b><small id="wkSum"></small></span><span class="chev" aria-hidden="true">▾</span></button>
      <div id="wkQ"></div>
      <button type="button" class="linkbtn wk-edit" id="wkEdit">${ic('edit')} Add, remove or reorder exercises</button>
    </div>
    <div class="card center hide" id="wkEmpty"><div class="big-ic">${ic('workouts')}</div><h2>No workouts yet</h2>
      <p class="sub">Queue up a few protocols with rest between them, then run them back to back. Each one is saved as its own session.</p>
      <button class="big" id="wkFirst">${ic('plus')} Build a workout</button>
      <button class="big ghost" id="wkTpls" style="margin-top:10px">${ic('sparkles')} Browse starter workouts</button></div>
    <div class="card" id="protoCard">
      <label class="f">Protocol</label>
      <button type="button" class="protobtn" id="protoBtn" aria-haspopup="dialog"><span><b id="protoName"></b><small id="protoUse"></small></span><span class="chev" aria-hidden="true">▾</span></button>
      <select id="proto" class="hide" aria-hidden="true" tabindex="-1"></select>
      <details class="panel inner" data-p="about" open><summary>${ic('about')} About</summary><div class="hint" id="protoHint"></div></details>
      <div id="modeWrap"><br><label class="f lab">${ic('mode')} Load method<span class="tip" data-tip="mode">i</span></label>
        <div class="chips g g2" data-k="mode"><span class="chip" data-v="hang">Hang (on board)</span><span class="chip" data-v="lift">No-hang (lift)</span></div></div>
    </div>
    <div class="card" id="paramCard"><div class="sugg hide" id="sugg"></div><div class="params" id="params"></div><p class="loadhint" id="loadHint"></p></div>
    <details class="card panel ${S.prefs.pgrip ? '' : 'hide'}" data-p="grip" open><summary>${ic('grip')} Grip<small id="gripSum"></small></summary><br>
      <label class="f">${ic('grip')} Grip type</label>
      <div class="chips g g6 tile" data-k="grip">${GRIPS.map(([n, k]) => `<span class="chip" data-v="${n}"><em>${ic(k)}</em>${n === 'Open' ? 'Open' : n}</span>`).join('')}</div>
      <br><label class="f">${ic('fingers')} Fingers</label>
      <div class="chips g g4" data-k="fing">${FINGERS.map(f => `<span class="chip" data-v="${f}">${f}</span>`).join('')}</div>
      <br><label class="f">${ic('hands')} Hands</label>
      <div class="chips g g4" data-k="hands">${(['both', 'L', 'R', 'LR'] as const).map(h => `<span class="chip" data-v="${h}">${handsLabel(h)}</span>`).join('')}</div>
    </details>
    <details class="card panel ${S.prefs.psetup ? '' : 'hide'}" data-p="setup" open><summary>${ic('board')} Setup<small id="setupSum"></small></summary><br>
      <label class="f">${ic('board')} Board</label><select id="board"></select>
      <br><br><label class="f">${ic('material')} Edge material</label>
      <div class="chips g g4" data-k="mat">${MATERIALS.map(m => `<span class="chip" data-v="${m}">${m}</span>`).join('')}</div>
      <br><label class="f">${ic('profile')} Edge profile</label>
      <div class="chips g g2" data-k="prof">${PROFILES.map(m => `<span class="chip" data-v="${m}">${m}</span>`).join('')}</div>
    </details>
    <div class="feelrow"><label class="f">${ic('feel')} Pre-session feel</label>
      <div class="chips feel g g8" data-k="feel">${FEELS.map(f => `<span class="chip" data-v="${f}" aria-label="Feeling ${f}">${ic(f)}</span>`).join('')}</div></div>
    <button class="big" id="start">${ic('play')} Start session</button>
    <button class="big ghost" id="backlog" style="margin-top:10px">${ic('calendar')} Log a past session</button>
    <p class="sub center" id="setupNote" style="margin-top:8px"></p>
  </section>

  <section id="v-timer" class="hide"><div class="card center">
    <div class="wprog hide" id="wprog"></div>
    <div class="sub" id="tmeta"></div>
    <div class="ring" id="ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="none" stroke="var(--line)" stroke-width="6"/><circle id="arc" cx="50" cy="50" r="45" fill="none" stroke-width="6" stroke-linecap="round" stroke-dasharray="282.7"/></svg>
      <div class="t"><div><div class="p" id="ph"></div><div class="hand hide" id="hand"></div><div class="n" id="num"></div><div class="sub" id="setlbl"></div></div></div></div>
    <div class="counts" aria-live="polite">
      <div class="cnt" id="cSet"><small id="cSetL">Set</small><b><span id="cSetN"></span><i id="cSetT"></i></b></div>
      <div class="cnt" id="cRep"><small id="cRepL">Rep</small><b><span id="cRepN"></span><i id="cRepT"></i></b></div>
    </div>
    <div class="dots" id="dots"></div>
    <button class="big letgo hide" id="letgo">${ic('open')} Let go and log time held</button>
    <div class="row"><button class="big ghost" id="pause">${ic('pause')} Pause</button><button class="big ghost" id="skip">Skip ${ic('skip')}</button></div>
    <div class="row" style="margin-top:10px"><button class="big ghost" id="edit">${ic('edit')} Edit</button><button class="big ghost danger-text" id="quit">${ic('x')} Cancel</button></div>
  </div></section>

  <section id="v-done" class="hide">
    <div class="hero"><div class="hero-ic">${ic('mountain')}</div><h2 id="cheer"></h2><p id="cheer2"></p></div>
    <div class="card">
      <label class="tname" id="sTitleW"><input id="sTitle" maxlength="${TITLE_MAX}" autocomplete="off" enterkeyhint="done" aria-label="Session name"><span class="tname-ic">${ic('edit')}</span></label>
      <div class="stats" style="margin:0"><div class="stat"><b id="sTime"></b>under tension</div><div class="stat"><b id="sSets"></b>full hangs</div><div class="stat"><b id="sPts"></b>points</div></div>
      <p class="dnote" id="res"></p>
    </div>
    <div class="card">
      <div id="rpeOne">
        <div class="rpe-hd"><span>How hard was that?</span><span id="rpeV" class="rpev"></span></div>
        <input type="range" min="1" max="10" value="7" id="rpe" class="rng" aria-label="Effort, 1 to 10">
        <div class="rpe-sc"><span>Easy</span><span>Max effort</span></div>
        <p class="dnote" id="rpeTip"></p>
      </div>
      <div id="wkRes" class="hide"></div>
      <input class="tx" id="note" maxlength="300" placeholder="Add a note for the feed (optional)" style="margin-top:12px">
    </div>
    <p class="dnote center" id="unlocks"></p>
    <button class="big" id="saveSess">Save session</button>
    <div class="links"><a data-skip role="button" tabindex="0">Don't save</a><a id="saveAsW" class="hide" role="button" tabindex="0">Save as a workout</a></div>
  </section>`;
  wireSetup(root);
  hydrateIcons(root);
}

// ---------------- setup ----------------
function protoOptions() {
  // hidden: only its values matter (the visible picker is #protoBtn and its list)
  $('#proto').innerHTML = [...Object.keys(allProtos()), '__new'].map(k => `<option value="${k}"></option>`).join('');
  ($('#proto') as HTMLSelectElement).value = cur;
}
/** The protocol field: name, with what it's for underneath. */
function drawProtoBtn() {
  const p = allProtos()[cur]; if (!p) return;
  $('#protoName').innerHTML = protoLabel(cur, p); $('#protoUse').textContent = p.use;
}
/** Pick a protocol from a list that says what each one is for. Picking sets the hidden select
 *  and fires its change event, so everything else works as it did with the dropdown. */
async function pickProtocol() {
  const P = allProtos(), custom = Object.keys(state.settings.customProtos);
  const item = (k: string) => `<button type="button" class="protoopt${k === cur ? ' on' : ''}" data-k="${k}"${k === cur ? ' aria-current="true"' : ''}><b>${protoLabel(k, P[k]!)}</b><small>${esc(P[k]!.use)}</small></button>`;
  const mine = (k: string) => `<div class="protorow">${item(k)}<button type="button" class="protodel" data-del="${k}" aria-label="Delete ${esc(P[k]!.n)}">${ic('trash')}</button></div>`;
  await sheet({
    title: 'Pick a protocol',
    body: `<div class="protolist full">${customOption()}${Object.keys(PROTOCOLS).map(item).join('')}
      ${custom.length ? `<p class="protogrp">My protocols</p>${custom.map(mine).join('')}` : ''}</div>`,
    onMount: el => {
      hydrateIcons(el);
      (el.querySelector('.protoopt.on') as HTMLElement | null)?.scrollIntoView({ block: 'nearest' });
      el.querySelector('.protolist')!.addEventListener('click', async e => {
        const d = (e.target as HTMLElement).closest('.protodel') as HTMLElement | null;
        if (d) { // delete, and keep the list open for picking
          if (!await deleteCustomProto(d.dataset.del!)) return;
          d.closest('.protorow')!.remove();
          if (!el.querySelector('.protorow')) el.querySelector('.protogrp')?.remove();
          return;
        }
        const b = (e.target as HTMLElement).closest('.protoopt') as HTMLElement | null; if (!b) return;
        closeSheet(el);
        const sel = $('#proto') as HTMLSelectElement;
        if (b.dataset.k === cur) { // picked again: back to its recommended settings, if they'd been changed
          persist();
          if (tweaked(cur)) { usePreset(cur); toast(`${allProtos()[cur]!.n} is back to its recommended settings`); }
          return;
        }
        protoOptions(); // in case a protocol was added elsewhere since the list was built
        sel.value = b.dataset.k!; if (sel.value) sel.dispatchEvent(new Event('change'));
      });
    },
  });
}

function hint(p: Protocol, canDelete = true) {
  const sr = p.reps > 1 ? `${p.sets} sets × ${p.reps} reps` : `${p.sets} hangs`;
  return `<div class="ptitle">${esc(p.n)}</div><div class="pby">${esc(p.by)}</div><div class="pdesc">${esc(p.d)}</div>
  <dl class="pinfo"><dt>Use for</dt><dd>${esc(p.use)}</dd><dt>Hang / rest</dt><dd>${p.hang}s on · ${p.rest}s off${p.setRest && p.reps > 1 ? ` · ${p.setRest}s between sets` : ''}</dd>
  <dt>Recommended</dt><dd>${sr}${p.mode === 'lift' ? ' · no-hang' : ''}${p.hands === 'LR' ? ' · each hand' : ''}</dd><dt>Intensity</dt><dd>${esc(p.int)}</dd><dt>How often</dt><dd>${esc(p.freq)}</dd><dt>Edge</dt><dd>${p.edge}mm</dd></dl>
  ${p.custom && canDelete ? `<button class="big ghost danger-text small-btn" id="delProto">${ic('trash')} Delete this protocol</button>` : ''}`;
}

function drawParams() {
  $('#params').innerHTML = FIELDS.filter(f => !f.show || f.show(val)).map(f => {
    const off = (f.k === 'add' && val.rem > 0) || (f.k === 'rem' && val.add > 0);
    const label = f.k === 'rest' && val.reps > 1 ? 'Rest between reps' : f.k === 'sets' && val.hands === 'LR' ? 'Sets (each hand)' : f.label;
    return `<div class="prm ${off ? 'off' : ''}" style="--c:${f.colour}"><div class="hd"><span class="ic">${ic(f.icon)}</span>${label}${TIPS[f.k] ? `<span class="tip" data-tip="${f.k}">i</span>` : ''}</div>
      <div class="step"><button data-k="${f.k}" data-d="-1" aria-label="Decrease ${label}">−</button><input id="i-${f.k}" value="${val[f.k]}" inputmode="decimal" aria-label="${label}"><small>${f.unit}</small><button data-k="${f.k}" data-d="1" aria-label="Increase ${label}">+</button></div></div>`;
  }).join('');
  hydrateIcons($('#params'));
  drawLoadHint();
}

/** The protocol's recommended intensity, kept beside the load settings (About can be hidden),
 *  plus what the current load works out to as % of bodyweight when we know it. */
export function drawLoadHint() {
  const p = allProtos()[cur], el = $('#loadHint'); if (!p || !el) return;
  const bw = state.priv.bodyweightKg;
  const pct = val.mode === 'lift' ? liftPct(bw, val.lift) : loadPct(bw, val.add, val.rem), one = val.hands !== 'both';
  // a lift is only the weight lifted (no bodyweight); one hand's share is shown the same way as a one-arm hang
  const load = val.mode === 'lift' && !val.lift ? 'Set the weight you’ll lift: just the plates or dumbbell, not your bodyweight.'
    : pct == null ? (bw == null ? 'Set your bodyweight in Profile to see your load as % of bodyweight.' : '')
    : val.mode === 'lift' ? `Lifting ${val.lift}kg ${one ? 'in one hand' : 'in each hand'} ≈ ${one ? Math.round((val.lift / bw!) * 100) : pct}% of bodyweight${one ? ', on one arm' : ''}. Only the weight counts, not you.`
    : `Your load: ${pct}% of bodyweight${one ? ', on one arm' : ''}.`;
  el.innerHTML = `${ic('effort')}<span><b>Target intensity:</b> ${esc(p.int)}${load ? `<small>${esc(load)}</small>` : ''}</span>`;
  hydrateIcons(el);
}

const chipVal = (k: string) => ($(`[data-k="${k}"] .chip.on`) as HTMLElement | null)?.dataset.v ?? '';
function setChip(k: string, v: string | undefined) {
  const g = $(`[data-k="${k}"]`); if (!g) return;
  const chips = $$('.chip', g); const hit = chips.find(c => c.dataset.v === v) ?? chips[k === 'feel' ? 5 : 0];
  chips.forEach(c => c.classList.toggle('on', c === hit));
}

export const getReady = () => { const v = state.settings.prefs.ready; return v == null ? 10 : Math.min(60, Math.max(0, Math.round(v))); };
export const preHang = () => { const v = state.settings.prefs.pre; return v == null ? 3 : Math.min(30, Math.max(0, Math.round(v))); };
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
  const sel = $('#board') as HTMLSelectElement | null; if (!sel) return; // the Hang page hasn't been drawn yet (opened on another tab)
  const b = sel.value;
  $('#gripSum').textContent = [chipVal('grip'), chipVal('fing'), val.hands !== 'both' ? handsLabel(val.hands) : ''].filter(Boolean).join(' · ');
  $('#setupSum').textContent = [b !== '__add' ? b : '', chipVal('mat'), chipVal('prof')].filter(Boolean).join(' · ');
}

function loadProto(k: string) {
  const P = allProtos(); if (!P[k]) k = 'max';
  const p = P[k]!; cur = k;
  val = { ...DEFAULTS, ...p, ...(state.settings.vals[k] ?? {}) } as Values;
  val.simple = !!p.simple;
  val.ready = getReady(); // one setting for every protocol (Profile → Settings)
  ($('#proto') as HTMLSelectElement).value = k; drawProtoBtn();
  $('#protoHint').innerHTML = hint(p);
  setChip('mode', val.mode); setChip('hands', val.hands);
  drawParams(); summaries(); hydrateIcons($('#protoHint')); drawSuggestion();
}

// ---------- load suggestion from last session's effort ----------
function drawSuggestion() {
  const sg = state.settings.suggest?.[cur], el = $('#sugg'); if (!el) return;
  el.classList.toggle('hide', !sg);
  if (sg) el.innerHTML = `${ic('chart')}<span>${esc(sg.text)}</span><button class="pill" id="suggUndo">Undo</button>`, hydrateIcons(el);
}
/** After saving, nudge next time's load: easy (RPE ≤5) → +2.5kg, very hard (RPE ≥9) → −2.5kg. */
function applyLoadSuggestion(s: NewSession) {
  const k = s.protocolKey, S = state.settings, a = loadAdjust(s, allProtos()[k]);
  S.suggest ??= {}; delete S.suggest[k];
  if (a) {
    S.vals[k] = { ...(S.vals[k] ?? {}), ...a.next };
    S.suggest[k] = { text: `${a.easier ? 'Felt easy' : 'Felt very hard'} last time (RPE ${s.rpe}), so the ${'edge' in a.next ? 'edge' : 'load'} is now ${a.what}`, prev: a.prev };
  }
  saveSettings();
  if (a && k === cur) loadProto(k);
}
function undoSuggestion() {
  const S = state.settings, sg = S.suggest?.[cur]; if (!sg) return;
  S.vals[cur] = { ...(S.vals[cur] ?? {}), add: sg.prev.add, rem: sg.prev.rem, lift: sg.prev.lift, ...(sg.prev.edge != null ? { edge: sg.prev.edge } : {}) };
  delete S.suggest![cur]; saveSettings(); loadProto(cur); toast(sg.prev.edge != null ? 'Back to last time’s edge' : 'Back to last time’s load');
}

// ---------- safety nudges before hard sessions ----------
/** Warm-up and overtraining reminders before a max-effort session. 'warm' = the user chose to warm up first.
 *  `warmedInPlan`: a workout that already has something lighter before its hard part. */
async function safetyCheck(isHard: boolean, warmedInPlan = false): Promise<'go' | 'warm' | 'stop'> {
  const P = state.settings.prefs, warmCheck = P.warmup !== false, overCheck = P.nudges !== false;
  if ((!warmCheck && !overCheck) || !isHard) return 'go';
  const now = Date.now(), mine = mySessions();
  const hard = mine.filter(s => MAX_EFFORT.has(s.protocolKey));
  const week = hard.filter(s => now - +new Date(s.createdAt) < 7 * 864e5).length;
  const lastHard = hard.reduce((m, s) => Math.max(m, +new Date(s.createdAt)), 0);
  const recentlyActive = mine.some(s => now - +new Date(s.createdAt) < 60 * 60e3); // any session in the last hour counts as warm
  const needWarm = warmCheck && !recentlyActive && !warmedInPlan;
  const notes: string[] = [];
  if (overCheck && lastHard && now - lastHard < 24 * 3600e3) notes.push('You did a max-effort session in the last 24 hours. Fingers recover slower than muscles, so 48 hours between hard sessions is the usual advice.');
  if (overCheck && week >= 3) notes.push(`That would be ${week + 1} max-effort sessions this week. Most protocols recommend 2, at most 3.`);
  if (needWarm) notes.unshift('Hard hangs on cold fingers are the classic way to tweak a pulley. A few minutes of easy hangs first makes a real difference.');
  if (!notes.length) return 'go';
  const buttons = !needWarm ? [{ label: 'Change plan', kind: 'ghost' as const }, { label: 'Start anyway', kind: 'primary' as const }]
    : [{ label: 'Skip, I’m warm', kind: 'ghost' as const }, { label: 'Warm up first', kind: 'primary' as const }];
  const i = await sheet({ title: needWarm ? 'Warm up first?' : 'Quick check', body: notes.map(n => `<p class="sub" style="text-align:left">${n}</p>`).join('') + '<p class="sub" style="font-size:12px">You can turn these off in Profile → Settings.</p>', buttons });
  if (!needWarm) return i === 1 ? 'go' : 'stop';
  return i === 1 ? 'warm' : i === 0 ? 'go' : 'stop';
}
async function preStartCheck(): Promise<boolean> {
  const r = await safetyCheck(MAX_EFFORT.has(cur));
  if (r === 'warm') { state.settings.returnTo = cur; saveSettings(); usePreset('warm'); toast('Warm-up loaded. You’ll be brought back after.'); return false; }
  return r === 'go';
}

/** Picking a protocol starts it from its recommended settings, keeping your load for it (see personalVals).
 *  Tweaks made after that are remembered until you pick a protocol again. */
function usePreset(k: string) {
  const S = state.settings;
  S.vals[k] = personalVals(k, S.vals[k]);
  loadProto(k); persist();
}
/** Settings changed from the protocol's recommended ones (beyond your load). Call persist() first. */
const tweaked = (k: string) => Object.keys(state.settings.vals[k] ?? {}).length > Object.keys(personalVals(k, state.settings.vals[k])).length;

function persist() {
  readInputs();
  val.mode = (chipVal('mode') || 'hang') as Values['mode'];
  val.hands = (chipVal('hands') || 'both') as Values['hands'];
  if (run) { persistBlock(); return; }
  const p = allProtos()[cur]!, o: Record<string, any> = {};
  for (const x of ['hang', 'rest', 'sets', 'reps', 'setRest', 'edge', 'add', 'rem', 'lift', 'effort', 'sw', 'mode', 'hands'] as const)
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
  const n = (name ?? await promptSheet('Add a board', 'Name it and it becomes your default for new sessions.', 'e.g. Garage board'))?.trim().slice(0, 60); // the database keeps up to 60
  if (!n) { drawBoards(); return; }
  const B = state.settings.boards;
  if (!B.list.includes(n)) B.list.unshift(n);
  if (!B.custom.includes(n)) B.custom.push(n);
  B.def = n; state.settings.board = n; saveSettings(); drawBoards(); summaries(); toast(`${n} saved as your default`); checkUnlocks();
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

  $('#protoBtn').addEventListener('click', pickProtocol);
  $('#proto').addEventListener('change', async e => {
    const sel = e.target as HTMLSelectElement;
    if (sel.value !== '__new') { persist(); usePreset(sel.value); return; }
    sel.value = cur; persist();
    // the same as "Custom exercise…" in a workout, starting from what's on screen (so tweaks can be kept as your own protocol)
    const made = await newCustomExercise({ id: newId('b'), proto: cur, vals: sanitizeVals(val, protoValues(allProtos()[cur]!)), grip: chipVal('grip'), fing: chipVal('fing'), restAfter: 0 });
    if (!made) return;
    setChip('grip', made.block.grip); setChip('fing', made.block.fing);
    protoOptions(); loadProto(made.key); persist();
  });
  $('#protoHint').addEventListener('click', e => { if ((e.target as HTMLElement).closest('#delProto')) deleteCustomProto(cur); });

  const params = $('#params');
  // +/− buttons: tap to step once; press and hold to repeat, getting faster the longer
  // you hold (and taking bigger steps after a couple of seconds).
  const bump = (b: HTMLElement, mult = 1) => {
    const f = FIELDS.find(x => x.k === b.dataset.k)!, i = $(`#i-${f.k}`) as HTMLInputElement;
    const [lo, hi] = LIMITS[f.k] ?? [0, 9999];
    const next = Math.min(hi, Math.max(lo, +(+i.value + f.step * mult * +b.dataset.d!).toFixed(1)));
    if (+i.value === next) return false; // hit a limit
    i.value = String(next); return true;
  };
  const commit = (k: string) => {
    readInputs();
    if (k === 'add' && val.add > 0) val.rem = 0;
    if (k === 'rem' && val.rem > 0) val.add = 0;
    drawParams(); persist();
  };
  let hold: { b: HTMLElement; timer: number; ticks: number } | null = null;
  const stopHold = () => { if (!hold) return; clearTimeout(hold.timer); const k = hold.b.dataset.k!; hold.b.classList.remove('held'); hold = null; commit(k); };
  const tick = () => {
    if (!hold) return;
    hold.ticks++;
    const mult = hold.ticks > 30 ? 5 : 1;                         // after ~2.5s, jump 5 steps at a time
    if (!bump(hold.b, mult)) { stopHold(); return; }
    if (hold.ticks % 3 === 0) vibrate(5);
    hold.timer = window.setTimeout(tick, Math.max(40, 260 * 0.88 ** hold.ticks)); // 260ms → 40ms
  };
  params.addEventListener('pointerdown', e => {
    const b = (e.target as HTMLElement).closest('button[data-k]') as HTMLElement | null; if (!b || e.button > 0) return;
    e.preventDefault(); // keep focus/selection out of the way while holding
    stopHold();
    b.setPointerCapture?.(e.pointerId);
    bump(b); vibrate(8); b.classList.add('held');
    hold = { b, ticks: 0, timer: window.setTimeout(tick, 420) };  // short pause before repeating, so a tap = one step
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) params.addEventListener(ev, stopHold);
  params.addEventListener('contextmenu', e => { if ((e.target as HTMLElement).closest('button[data-k]')) e.preventDefault(); }); // no long-press menu
  // keyboard users (Enter/Space) still get one step per press
  params.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest('button[data-k]') as HTMLElement | null;
    if (!b || e.detail !== 0) return; // pointer presses are handled above
    if (bump(b)) commit(b.dataset.k!);
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

  $('#start').addEventListener('click', async () => {
    unlockAudio();
    if (!run && !(editing && timer) && hangMode() === 'workout') { const w = selWorkout(); if (w) beginWorkout(cloneWorkout(w)); return; }
    readInputs();
    if (val.mode === 'lift' && !val.lift) return toast('Set the weight you’ll lift first: just the plates or dumbbell, not your bodyweight.', 4000); // a lift of nothing isn't training
    // the server stores at most 1,500 hangs and 2 hours under tension per session
    const hangs = val.sets * val.reps * (val.hands === 'LR' ? 2 : 1);
    if (hangs > 1500 || hangs * val.hang > 7200) return toast(`That's ${hangs.toLocaleString()} hangs${hangs * val.hang > 7200 ? ` and over 2 hours on the board` : ''}. Cut the sets, reps or hang time to log it.`, 5000);
    if (!(editing && timer) && !(await preStartCheck())) return;
    start();
  });
  $('#backlog').addEventListener('click', backlog);
  $('#sugg').addEventListener('click', e => { if ((e.target as HTMLElement).closest('#suggUndo')) undoSuggestion(); });
  $('#pause').addEventListener('click', togglePause);
  $('#skip').addEventListener('click', () => { unlockAudio(); timer?.skip(); });
  $('#letgo').addEventListener('click', () => { if (!timer) return; unlockAudio(); beep(440, 0.3); const h = timer.letGo(); toast(`Held ${h}s, logged`); });
  $('#quit').addEventListener('click', quit);
  $('#edit').addEventListener('click', () => {
    if (!timer) return;
    const between = !!timer.step?.between; // resting before a workout's next exercise: edit that one
    timer.pause(); timer.stop(); editing = true; keepAwake(false);
    // Resuming starts from the setup screen, so always give a get-ready countdown to get back on the board
    // (a workout's later exercises otherwise have none: the rest before them is their countdown).
    val.ready = getReady();
    show('setup'); layout();
    $('#start').innerHTML = `${ic('replay')} ${between ? 'Start this exercise' : 'Resume with changes'}`; hydrateIcons($('#start'));
    toast(between ? 'Tweak the next exercise, then start it' : 'Tweak and resume. Completed hangs are kept.');
  });
  $('#setlbl').addEventListener('click', () => { if (timer?.step.p === 'ready' && bumpDaily(state.settings.flags, 'chalk') >= 10) { state.settings.flags.chalkBucket = true; saveSettings(); checkUnlocks(); } });
  $('#rpe').addEventListener('input', rpeUpd);
  $('#saveSess').addEventListener('click', saveSession);
  root.querySelector('[data-skip]')!.addEventListener('click', async () => {
    const saved = run?.done.filter(d => d.savedId).length ?? 0; // an earlier save attempt that stopped part-way
    const what = !run ? 'This session will be discarded.' : saved ? `The ${saved} exercise${saved > 1 ? 's' : ''} already saved will stay. The rest will be discarded.` : 'This workout will be discarded.';
    if (!await confirmSheet("Don't save?", what, 'Discard', 'Keep it')) return;
    pending = null;
    if (run) { clearBackup(); endRun(); }
    show('setup');
  });
  $('#saveAsW').addEventListener('click', saveRunAsWorkout);
  $('#wkRes').addEventListener('input', e => {
    const r = (e.target as HTMLElement).closest('input[data-j]') as HTMLInputElement | null; if (!r || !run) return;
    const d = run.done[+r.dataset.j!]; if (d) d.s.rpe = +r.value;
    rpeLabel(r);
  });
  $('#wkRes').addEventListener('change', e => {
    const n = (e.target as HTMLElement).closest('input[data-tj]') as HTMLInputElement | null; if (!n || !run) return;
    const d = run.done[+n.dataset.tj!]; if (d) { d.s.title = titleOf(n.value, d.name); backupRun(); }
  });
  // a name: tap it and type to replace it, Done to finish
  pickAllOnFocus($('#v-done'), '.tname input');
  $('#v-done').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.target as HTMLElement).closest('.tname input')) (e.target as HTMLInputElement).blur(); });

  // ---- workouts ----
  const setMode = (m: 'single' | 'workout') => {
    if (run || (editing && timer) || hangMode() === m) return;
    state.settings.hangMode = m; saveSettings(); layout(); drawWorkoutCard();
    slideIn($('#v-setup'), m === 'workout' ? 'left' : 'right'); // Workout sits to the right of Single session
  };
  $('#hangMode').addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest('[data-m]') as HTMLElement | null; if (b) setMode(b.dataset.m as 'single' | 'workout');
  });
  // swipe left for Workout, right for Single session
  onSwipe($('#v-setup'), dir => { if (!$('#hangMode').classList.contains('hide')) setMode(dir === 'left' ? 'workout' : 'single'); });
  $('#wkBtn').addEventListener('click', pickWorkout);
  $('#wkEdit').addEventListener('click', () => openBuilder(selWorkout()));
  $('#wkFirst').addEventListener('click', () => openBuilder(null));
  $('#wkTpls').addEventListener('click', () => { state.settings.panels.tpl = true; saveSettings(); go('workouts'); });
  layout(); drawWorkoutCard();
  setTimeout(offerRestore, 800);
}

function show(which: 'setup' | 'timer' | 'done') {
  for (const k of ['setup', 'timer', 'done']) $(`#v-${k}`).classList.toggle('hide', k !== which);
  scrollTo(0, 0);
}
export const hangBusy = () => !!timer && !$('#v-timer')?.classList.contains('hide');
/** A session is waiting on the done screen to be saved, or a workout is under way. */
export const hangPending = () => !!pending || !!run;
/** Bring the Hang page up to date when coming back to it (settings may have changed on other tabs). */
export function refreshHang() { drawLoadHint(); if (!timer) { layout(); drawWorkoutCard(); } }

// ---------------- timer ----------------
const COL: Record<Step['p'], string> = { ready: 'var(--gold)', hang: 'var(--acc)', rest: 'var(--blue)', sw: 'var(--gold)' };

function start() {
  unlockAudio(); keepAwake(true); persist();
  const resuming = editing && !!timer;
  if (resuming) slowBurn(timer!.longestPause()); // paused for Edit all this time
  else if (!run) val.ready = getReady(); // the countdown may have been changed in Profile since this protocol loaded
  const prevLog = resuming ? timer!.log : [];
  // Every hang already done is in the log (even across several edits), so skip that many.
  const doneHangs = prevLog.length;
  let steps = buildSteps(val);
  if (resuming && doneHangs > 0) {
    let seen = 0; const i = steps.findIndex(s => s.p === 'hang' && seen++ === doneHangs);
    if (i === -1) {
      // the edited plan has no hangs left — finish with what's been done
      editing = false; layout();
      timer = null; done(prevLog); return;
    }
    const lead = val.ready > 0 ? 1 : 0;
    steps = [...steps.slice(0, lead), ...steps.slice(i)];
  }
  if (!resuming) { startedAt = Date.now(); if (!run && state.settings.suggest?.[cur]) { delete state.settings.suggest[cur]; saveSettings(); $('#sugg').classList.add('hide'); } }
  editing = false; layout();
  if (!steps.some(s => s.p === 'hang')) { toast('Add at least one set'); return; }
  timer?.stop();
  timer = new SessionTimer(steps, { onTick: render, onPhase: phase, onWarn: () => beep(880), onDone: done });
  timer.log = prevLog;
  timer.preWarn = preHang();
  const load = val.mode === 'lift' ? `lift ${val.lift}kg @ ${val.effort}%` : val.add ? `+${val.add}kg` : val.rem ? `−${val.rem}kg` : 'bodyweight';
  $('#tmeta').textContent = `${allProtos()[cur]!.n} · ${val.edge}mm ${chipVal('mat').toLowerCase()} · ${load}`;
  $('#pause').innerHTML = `${ic('pause')} Pause`; hydrateIcons($('#pause'));
  drawProgress(false); show('timer'); timer.start();
}

function phase(s: Step) {
  beep(s.p === 'hang' ? 1320 : 660, 0.35); vibrate(200);
  $('#letgo').classList.toggle('hide', s.p !== 'hang');
}
function render(s: Step, left: number) {
  const warn = s.p === 'hang' ? left <= 3 : left <= 5;
  $('#ring').className = 'ring' + (warn ? ' warn' : '');
  const ph = $('#ph'); ph.textContent = { ready: 'Get ready', hang: val.mode === 'lift' ? 'Pull!' : 'Hang!', rest: s.between ? 'Rest' : s.bigRest ? 'Set rest' : 'Rest', sw: 'Switch hands' }[s.p]; ph.style.color = COL[s.p];
  $('#num').textContent = String(left);
  $('#setlbl').textContent = s.p === 'ready' ? 'Chalk up 🧂' : s.between ? `Next: ${allProtos()[cur]?.n ?? ''}` : '';
  // One-arm sessions: show which hand, big and colour-coded. During rests it shows the next hand.
  const hEl = $('#hand'), upcoming = s.p === 'hang' ? s : timer?.steps.slice(timer.idx).find(x => x.p === 'hang');
  // Set and rep, big enough to read with the phone propped up across the room.
  // While hanging: the current one. Otherwise: the one coming up next.
  const at = upcoming ?? s, now = s.p === 'hang';
  $('#cSetL').textContent = now ? 'Set' : 'Next set'; $('#cSetN').textContent = String(at.set ?? 1); $('#cSetT').textContent = `/${val.sets}`;
  $('#cRep').classList.toggle('hide', val.reps <= 1);
  $('#cRepL').textContent = now ? 'Rep' : 'Next rep'; $('#cRepN').textContent = String(at.rep ?? 1); $('#cRepT').textContent = `/${val.reps}`;
  $('.counts').classList.toggle('now', now);
  const hand = upcoming?.hand && upcoming.hand !== 'both' ? upcoming.hand : null;
  hEl.classList.toggle('hide', !hand);
  if (hand) {
    hEl.className = `hand ${hand === 'L' ? 'left' : 'right'}`;
    hEl.textContent = s.p === 'hang' ? (hand === 'L' ? '← LEFT HAND' : 'RIGHT HAND →') : (hand === 'L' ? 'Next: ← left hand' : 'Next: right hand →');
  }
  const arc = $('#arc') as unknown as SVGCircleElement; arc.style.strokeDashoffset = String(282.7 * (1 - left / Math.max(1, s.t))); arc.style.stroke = COL[s.p];
  const lastHand = val.hands === 'LR' ? 'R' : val.hands === 'both' ? 'both' : val.hands;
  // a set is done once its last rep (and last hand) has been passed
  const setsDone = timer ? (timer.steps.slice(0, timer.idx).filter(x => x.p === 'hang' && x.rep === val.reps && x.hand === lastHand).at(-1)?.set ?? 0) : 0;
  $('#dots').innerHTML = Array.from({ length: val.sets }, (_, i) => `<i class="${i < setsDone ? 'd' : i === setsDone && s.p === 'hang' ? 'c' : ''}"></i>`).join('');
}
function togglePause() {
  if (!timer) return;
  unlockAudio();
  if (timer.paused) { slowBurn(timer.longestPause()); timer.resume(); }
  else timer.pause();
  $('#pause').innerHTML = timer.paused ? `${ic('play')} Resume` : `${ic('pause')} Pause`; hydrateIcons($('#pause'));
}
/** Secret Slow Burn: paused for 30 minutes or more mid-session, however the pause ends. */
function slowBurn(pausedMs: number) {
  if (pausedMs < 30 * 60e3 || state.settings.flags.slowBurn) return;
  state.settings.flags.slowBurn = true; saveSettings(); checkUnlocks();
}
/** Secret Dramatic Exit: Cancel tapped within 10 seconds of starting, then Give up (however long the choice took). */
function dramaticExit(tappedAt: number) {
  if (tappedAt - startedAt >= 10_000) return;
  state.settings.flags.dramaticExit = true; saveSettings(); checkUnlocks();
}
async function quit() {
  if (!timer) return;
  const tappedAt = Date.now(), wasPaused = timer.paused; timer.pause(); togglePauseLabel();
  if (run) return quitRun(wasPaused, tappedAt);
  const n = timer.log.length + (timer.heldNow() > 0 ? 1 : 0), canSave = n > 0;
  const choice = await sheet({
    title: 'Cancel session?',
    body: `<p class="sub">${canSave ? `<b>End session early</b> saves the ${n > 1 ? `${n} hangs` : 'hang'} you've done so far (a hang in progress counts for the time held). <b>Give up</b> saves nothing.` : "This session won't be saved or count toward the leaderboard."}</p>`,
    buttons: canSave
      ? [{ label: 'Hang in there 💪', kind: 'ghost' }, { label: 'End session early', kind: 'primary' }, { label: 'Give up 🏳️', kind: 'danger' }]
      : [{ label: 'Hang in there 💪', kind: 'ghost' }, { label: 'Give up 🏳️', kind: 'danger' }],
  });
  const giveUp = canSave ? choice === 2 : choice === 1, endEarly = canSave && choice === 1;
  if (!timer) return;
  slowBurn(timer.longestPause()); // the sheet kept it paused too
  if (endEarly) {
    const log = timer.endEarly(); keepAwake(false);
    done(log); toast('Ended early. Here’s what you did');
  } else if (giveUp) {
    dramaticExit(tappedAt);
    timer.stop(); timer = null; keepAwake(false); show('setup'); toast('Session cancelled');
  } else if (!wasPaused) { timer.resume(); togglePauseLabel(); }
}
function togglePauseLabel() { if (timer) { $('#pause').innerHTML = timer.paused ? `${ic('play')} Resume` : `${ic('pause')} Pause`; hydrateIcons($('#pause')); } }

// ---------------- done ----------------
function rpeUpd() {
  const n = +($('#rpe') as HTMLInputElement).value;
  $('#rpeV').innerHTML = `<small>${RW[n]}</small><b>${n}</b>`;
  $('#rpeTip').textContent = n <= 5 ? "Felt easy, so we'll suggest +2.5kg next time." : n <= 8 ? 'Right in the zone. Same load next time.' : "Very hard, so we'll suggest backing off 2.5kg.";
}

// ---------------- back-log a session done without the timer ----------------
/** datetime-local value (local time, no seconds) */
const localIso = (d: Date) => new Date(+d - d.getTimezoneOffset() * 60e3).toISOString().slice(0, 16);
let backdate: string | null = null;
async function backlog() {
  // mid-session edit: the timer's hangs are still waiting to be resumed, so don't throw them away
  if (editing && timer) return toast('Finish or cancel the current session first');
  readInputs(); persist();
  if (val.mode === 'lift' && !val.lift) return toast('Set the weight you’ll lift first: just the plates or dumbbell, not your bodyweight.', 4000);
  const hangs = val.sets * val.reps * (val.hands === 'LR' ? 2 : 1);
  if (hangs > 1500 || hangs * val.hang > 7200) return toast(`That's ${hangs.toLocaleString()} hangs. Cut the sets, reps or hang time to log it.`, 5000);
  // The server accepts up to 7 days back. A finished season's results are final, so not before this season began either.
  const now = new Date(), min = new Date(Math.max(+now - 7 * 864e5 + 60e3, +seasonOf(now).start));
  let when!: HTMLInputElement;
  const p = allProtos()[cur]!;
  const i = await sheet({
    title: 'Log a past session',
    body: `<p class="sub">Logs <b>${esc(p.n)}</b> with your current settings (${val.sets} × ${val.reps > 1 ? `${val.reps} × ` : ''}${val.hang}s${val.hands === 'LR' ? ', each hand' : ''}), every hang held full time.</p>
      <label class="f" style="text-align:left">When did you do it?</label>
      <input class="tx" type="datetime-local" id="blWhen" value="${localIso(now)}" min="${localIso(min)}" max="${localIso(now)}" style="margin-bottom:12px">
      <p class="sub" style="font-size:12px">Up to 7 days back, within this season.</p>
      <div class="peekrow"><span class="promisecol"><p class="promise">I promise I did these hangs.<br>Why would I deceive you?</p></span><span class="peek" aria-hidden="true"><img src="${deceiveFace}" alt=""></span></div>`,
    buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'I promise', kind: 'primary' }],
    onMount: el => { when = el.querySelector('#blWhen')!; },
  });
  if (i !== 1) return;
  const t = new Date(+new Date(when.value) + Date.now() % 60e3); // the picker has no seconds: borrow the current ones so two back-logged sessions don't share a time
  if (isNaN(+t)) return toast('Pick when you did it');
  if (+t < +min || +t > Date.now() + 60e3) return toast('Past sessions can go back up to 7 days, within this season');
  const log: HangResult[] = buildSteps(val).filter(s => s.p === 'hang').map(s => ({ set: s.set!, rep: s.rep!, hand: s.hand!, target: s.t, held: s.t, full: true }));
  if (!log.length) return toast('Add at least one set');
  backdate = t.toISOString();
  done(log);
}

/** A session not saved yet. Its id is chosen now and kept through retries and the unsaved-workout backup,
 *  so a save that reached the server but lost its reply is recognised instead of saved twice. */
type Pending = NewSession & { id: string };
let pending: Pending | null = null;
/** The session for hangs just done with the current protocol and settings (points and PB worked out
 *  against `mine`, the climber's earlier sessions). `at` = when it finished (default: now, set on save). */
function makeSession(log: HangResult[], mine: readonly Session[], at?: string): Pending {
  const tut = log.reduce((a, h) => a + h.held, 0), full = log.filter(h => h.full).length;
  const bw = state.priv.bodyweightKg;
  const lp = val.mode === 'lift' ? liftPct(bw, val.lift) : loadPct(bw, val.add, val.rem);
  // A PB only counts against genuinely comparable sessions: same mode, edge, hands
  // (one-arm vs two) and a similar hang length (within ±3s).
  const comparable = mine.filter(s => s.mode === val.mode && s.edgeMm === val.edge && s.fullHangs > 0
    && (s.hands === 'both') === (val.hands === 'both') && Math.abs(s.hang - val.hang) <= 3
    && (val.mode === 'lift' || s.loadPct != null)); // sessions logged before bodyweight was set can't be compared
  const heavier = full > 0 && comparable.length > 0 && (val.mode === 'lift'
    ? comparable.every(s => s.liftKg < val.lift)
    : lp != null && comparable.every(s => (s.loadPct ?? 0) < lp));
  // Also a PB: held a smaller edge than ever before at the same load or more (how Min Edge progresses).
  const sameStyle = mine.filter(s => s.mode === 'hang' && val.mode === 'hang' && s.fullHangs > 0 && s.loadPct != null
    && (s.hands === 'both') === (val.hands === 'both') && Math.abs(s.hang - val.hang) <= 3);
  const smallerEdge = full > 0 && lp != null && sameStyle.length > 0
    && sameStyle.filter(s => s.loadPct! >= lp).every(s => s.edgeMm > val.edge)
    && sameStyle.some(s => s.edgeMm > val.edge); // must actually beat an earlier edge
  const isPb = heavier || smallerEdge;
  const s: Pending = {
    id: newSessionId(), protocolKey: cur, protocolName: allProtos()[cur]!.n, mode: val.mode, hang: val.hang, rest: val.rest, sets: val.sets, reps: val.reps, setRest: val.setRest,
    edgeMm: val.edge, addedKg: val.mode === 'lift' ? 0 : val.add, assistKg: val.mode === 'lift' ? 0 : val.rem, liftKg: val.mode === 'lift' ? val.lift : 0, effortPct: val.effort,
    hands: val.hands, grip: chipVal('grip'), fingers: chipVal('fing'), board: ($('#board') as HTMLSelectElement).value, edgeMaterial: chipVal('mat'), edgeProfile: chipVal('prof'),
    feel: chipVal('feel'), rpe: 7, tutS: tut, fullHangs: full, totalHangs: log.length, hangs: log, loadPct: lp, isPb, note: '', points: 0,
    ...(at ? { createdAt: at } : {}),
  };
  s.points = sessionPoints({ ...s, createdAt: at ?? new Date().toISOString() }, mine);
  return s;
}

function done(log: HangResult[]) {
  if (timer) slowBurn(timer.longestPause());
  timer = null;
  if (run) { blockDone(log); return; }
  keepAwake(false);
  const q = QUOTES[Math.floor(Math.random() * QUOTES.length)]!;
  const mine = mySessions(), past = backdate; backdate = null;
  pending = makeSession(log, mine, past ?? undefined);
  const { tutS: tut, fullHangs: full, isPb } = pending, short = log.filter(h => !h.full), bw = state.priv.bodyweightKg;
  $('#cheer').textContent = q[0]; $('#cheer2').textContent = q[1];
  $('#sTime').textContent = tut + 's'; $('#sSets').textContent = `${full}/${log.length}`; $('#sPts').textContent = '+' + pending.points;
  const lr = (h: 'L' | 'R') => log.filter(x => x.hand === h).reduce((a, x) => a + x.held, 0);
  $('#res').textContent = (short.length ? `${short.length} cut short (${short.map(x => x.held + 's').join(', ')})` : '✓ Every hang held full time')
    + (val.hands === 'LR' ? ` · Left ${lr('L')}s / Right ${lr('R')}s` : '') + (isPb ? ' · 🏅 New personal best!' : '')
    + (bw == null && val.mode !== 'lift' ? ' · Add your bodyweight in Profile for fairer scoring' : '')
    + (mine.some(s => scoringDay(s.createdAt) === scoringDay(past ?? new Date().toISOString())) ? ' · Points add to what you’ve already trained today' : '')
    + (past ? ` · Logged for ${new Date(past).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : '');
  const unlocked = diffUnlocks(achievementCtx(), achievementCtx([{ ...pending, id: 'x', userId: '', createdAt: past ?? new Date().toISOString() } as any, ...mine]));
  drawUnlocks(unlocked);
  $('#rpeOne').classList.remove('hide'); $('#wkRes').classList.add('hide'); $('#saveAsW').classList.add('hide');
  const t = $<HTMLInputElement>('#sTitle'); t.value = t.placeholder = pending.protocolName; $('#sTitleW').classList.remove('hide');
  $('#saveSess').textContent = 'Save session';
  ($('#rpe') as HTMLInputElement).value = '7'; rpeUpd(); ($('#note') as HTMLInputElement).value = '';
  show('done'); if (!past) { fanfare(); vibrate([100, 50, 100, 50, 300]); } confetti();
}
function drawUnlocks(unlocked: { icon: string; text: string }[]) {
  $('#unlocks').innerHTML = unlocked.length ? 'Unlocked: ' + unlocked.map(u => `<span class="unl">${ic(u.icon)} ${esc(u.text)}</span>`).join(' &nbsp;·&nbsp; ') : ''; hydrateIcons($('#unlocks'));
}

async function saveSession() {
  if (run) return saveRun();
  if (!pending) return;
  const btn = $('#saveSess') as HTMLButtonElement; btn.disabled = true;
  try {
    pending.rpe = +($('#rpe') as HTMLInputElement).value;
    pending.note = ($('#note') as HTMLInputElement).value.trim();
    pending.title = titleOf($<HTMLInputElement>('#sTitle').value, pending.protocolName);
    const saved = pending;
    const { session: s, queued } = await saveOrQueue(saved);
    addSaved(s, queued); pending = null;
    applyLoadSuggestion(saved); checkUnlocks();
    const back = state.settings.returnTo;
    if (saved.protocolKey === 'warm' && back && allProtos()[back]) { delete state.settings.returnTo; saveSettings(); loadProto(back); persist(); toast(`Warmed up. ${allProtos()[back]!.n} is ready`, 3500); show('setup'); scrollTo(0, 0); return; }
    // a database without session names yet saves it without its name
    if (saved.title && !s.title) toast('Session saved, without its name: naming sessions needs the latest database update (supabase/schema.sql).', 6000);
    else toast(queued ? 'No signal, so it’s saved on this phone. It’ll upload automatically.' : 'Session saved', queued ? 4500 : 2200);
    show('setup'); go('stats');
  } catch (e: any) { toast(e.message ?? 'Could not save. Try again.'); }
  finally { btn.disabled = false; }
}
/** A session's name as typed: none if it's left blank or as its protocol's name. */
export const titleOf = (typed: string, protocolName: string) => { const t = typed.trim().slice(0, TITLE_MAX); return t === protocolName ? '' : t; };
/** Put a just-saved session into the loaded list. */
function addSaved(s: Session, queued: boolean) {
  // the server may hand back one it already had (a retried save): replace it rather than list it twice
  const dup = state.sessions.findIndex(x => x.id === s.id); if (dup >= 0) state.sessions.splice(dup, 1);
  // a back-logged session goes in date order, not at the top
  const at = state.sessions.findIndex(x => x.createdAt <= s.createdAt);
  state.sessions.splice(at === -1 ? state.sessions.length : at, 0, s);
  if (!queued) rescoreDay(state.sessions, s.userId, scoringDay(s.createdAt)); // a back-logged session changes later ones that day (the server does the same)
}

// ---------------- workouts: several protocols back to back ----------------
// Each exercise runs on its own timer (so Edit, Skip, Let go and the set/rep counters work exactly as
// for a single session), with a rest timer between them. Every exercise becomes its own session,
// all saved together from the summary at the end.
interface DoneBlock { blockId: string; name: string; s: Pending; savedId?: string; }
/** `warmId`: a warm-up added at the start for this run only ("Warm up first"). */
interface Run { w: Workout; i: number; done: DoneBlock[]; warmId?: string; }
let run: Run | null = null;
/** Grip and fingers shown when the current exercise loaded (its own, or the Hang page's for a blank one). */
let shown = { grip: '', fing: '' };

const hangMode = () => state.settings.hangMode === 'workout' ? 'workout' : 'single';
/** The workout picked on the Hang page (the first one if none is picked yet). */
function selWorkout() { return findWorkout(state.settings.workoutSel) ?? libWorkouts()[0]; }

/** Show the parts of the setup screen that fit: a single session, a workout to pick, or the exercise being edited mid-workout. */
function layout() {
  if (!$('#hangMode')) return;
  // a single session paused for Edit keeps its own layout until it's resumed or cancelled
  const editSingle = !run && editing && !!timer;
  const S = state.settings, wk = !run && !editSingle && hangMode() === 'workout', w = selWorkout(), empty = wk && !w;
  $$('#hangMode button').forEach(b => { const on = b.dataset.m === hangMode(); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  $('#hangMode').classList.toggle('hide', !!run || editSingle);
  $('#protoCard').classList.toggle('hide', wk);
  $('#paramCard').classList.toggle('hide', wk);
  $('#v-setup [data-p="grip"]').classList.toggle('hide', wk || !S.prefs.pgrip);
  $('#v-setup [data-p="setup"]').classList.toggle('hide', empty || !S.prefs.psetup);
  $('#v-setup .feelrow').classList.toggle('hide', empty);
  $('#wkCard').classList.toggle('hide', !wk || empty);
  $('#wkEmpty').classList.toggle('hide', !empty);
  $('#backlog').classList.toggle('hide', wk || !!run);
  $('#start').classList.toggle('hide', empty);
  ($('#protoBtn') as HTMLButtonElement).disabled = !!run;
  const note = $('#setupNote');
  note.classList.toggle('hide', empty);
  note.textContent = run ? `Changes apply to the rest of this workout${findWorkout(run.w.id) ? ' and are saved to it' : ''}` : wk ? 'Tap an exercise or a rest to change it' : 'Picking a protocol loads its recommended settings. Your load is remembered.';
  if (!editing) { $('#start').innerHTML = `${ic('play')} ${wk ? 'Start workout' : 'Start session'}`; hydrateIcons($('#start')); }
  $('#runNote').classList.toggle('hide', !run);
  if (run) { $('#runNote').innerHTML = `${ic('workouts')}<span>Exercise <b>${Math.min(run.i + 1, run.w.blocks.length)} of ${run.w.blocks.length}</b> in ${esc(run.w.name || 'this workout')}</span>`; hydrateIcons($('#runNote')); }
}

function drawWorkoutCard() {
  const w = selWorkout(); if (!w || !$('#wkCard')) return;
  state.settings.workoutSel = w.id;
  $('#wkName').textContent = w.name; $('#wkSum').textContent = totalsLine(w);
  // quick tweaks here (numbers, grip, rests) save straight to the workout; adding or reordering is in the builder
  drawQueue($('#wkQ'), w, { structure: false, onChange: () => { upsertWorkout(w); drawWorkoutCard(); } });
}

async function pickWorkout() {
  const sel = selWorkout()?.id;
  await sheet({
    title: 'Pick a workout',
    body: `<div class="protolist">${libWorkouts().map(w => `<button type="button" class="protoopt${w.id === sel ? ' on' : ''}" data-w="${esc(w.id)}"><b>${esc(w.name)}</b><small>${esc(totalsLine(w))}</small></button>`).join('')}
      <button type="button" class="protoopt" data-w="__new"><b>➕ New workout…</b><small>Queue up protocols with rest between them</small></button></div>`,
    onMount: el => el.querySelector('.protolist')!.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest('.protoopt') as HTMLElement | null; if (!b) return;
      closeSheet(el);
      if (b.dataset.w === '__new') { openBuilder(null); return; }
      state.settings.workoutSel = b.dataset.w; saveSettings(); drawWorkoutCard();
    }),
  });
}

/** Run a workout. Pass a copy: the saved one only changes through edits and load progression.
 *  Resolves true once it has started. Can be called from any tab. */
export async function beginWorkout(w: Workout): Promise<boolean> {
  unlockAudio(); // while we're still inside the tap (iOS)
  if (timer || run || pending) { toast('Finish or save your current session first'); return false; }
  if (!(await go('hang'))) return false;
  if (!(await settleBackup())) return false; // unsaved exercises from an earlier workout come first
  const P = allProtos(), all = w.blocks.length;
  w.blocks = w.blocks.filter(b => P[b.proto]);
  if (w.blocks.length < all) toast(`${all - w.blocks.length} exercise${all - w.blocks.length > 1 ? 's' : ''} skipped: the protocol was deleted`, 3500);
  if (!w.blocks.length) { toast('Add an exercise first'); return false; }
  // the server stores at most 1,500 hangs and 2 hours under tension per session
  const none = w.blocks.find(b => { const v = blockValues(b, P[b.proto]!, 0); return v.mode === 'lift' && !v.lift; });
  if (none) { toast(`${P[none.proto]!.n} is a no-hang lift with no weight. Tap it to set the weight you’ll lift.`, 5000); return false; }
  const big = w.blocks.find(b => hangCount(b.vals) > 1500 || hangCount(b.vals) * b.vals.hang > 7200);
  if (big) { toast(`${P[big.proto]!.n} is too long to log. Cut its sets, reps or hang time.`, 5000); return false; }
  const firstHard = w.blocks.findIndex(b => MAX_EFFORT.has(b.proto));
  const r = await safetyCheck(firstHard >= 0, firstHard > 0); // anything lighter first counts as warming up
  if (r === 'stop') return false;
  const S = state.settings;
  let warmId: string | undefined;
  if (r === 'warm') { const b = makeBlock('warm', P.warm!, personalVals('warm', S.vals.warm), { grip: S.chips.grip || undefined, fing: S.chips.fing || undefined, restAfter: 120 }); warmId = b.id; w.blocks.unshift(b); toast('Warm-up added to the start', 3000); }
  // "load changed" notes have done their job once those exercises are under way
  const lib = findWorkout(w.id); if (lib?.blocks.some(b => b.adj)) { lib.blocks.forEach(b => { delete b.adj; }); lib.updatedAt = Date.now(); saveSettings(); }
  run = { w, i: 0, done: [], warmId };
  loadBlock(0); start();
  return true;
}

/** Put exercise `i` of the running workout into the timer settings (and the setup screen, for Edit). */
function loadBlock(i: number) {
  const r = run!, b = r.w.blocks[i]!, p = allProtos()[b.proto]!, S = state.settings;
  r.i = i; cur = b.proto;
  val = blockValues(b, p, readyFor(r.w, i, getReady()));
  ($('#proto') as HTMLSelectElement).value = cur; drawProtoBtn();
  $('#protoHint').innerHTML = hint(p, false); hydrateIcons($('#protoHint'));
  setChip('mode', val.mode); setChip('hands', val.hands); setChip('grip', b.grip || S.chips.grip); setChip('fing', b.fing || S.chips.fing);
  shown = { grip: chipVal('grip'), fing: chipVal('fing') };
  $('#sugg').classList.add('hide');
  drawParams(); summaries(); layout();
}
/** Mid-workout edits: keep them for this run, and in the saved workout (as the Hang page keeps tweaks to the protocol in use). */
function persistBlock() {
  const r = run!, b = r.w.blocks[r.i]!, S = state.settings;
  // blank grip/fingers mean "whatever the Hang page has": only record one if it was changed from what was shown
  const pickG = chipVal('grip'), pickF = chipVal('fing');
  const vals = sanitizeVals(val, b.vals), grip = !b.grip && pickG === shown.grip ? '' : pickG, fing = !b.fing && pickF === shown.fing ? '' : pickF;
  // runs at every exercise start, so only write (and sync) settings when something actually changed
  let changed = JSON.stringify(vals) !== JSON.stringify(b.vals) || grip !== (b.grip ?? '') || fing !== (b.fing ?? '');
  if (changed) {
    b.vals = vals; b.grip = grip || undefined; b.fing = fing || undefined;
    const lib = findWorkout(r.w.id), lb = lib?.blocks.find(x => x.id === b.id);
    if (lb) { lb.vals = { ...vals }; lb.grip = b.grip; lb.fing = b.fing; lib!.updatedAt = Date.now(); }
  }
  for (const c of ['mat', 'prof', 'feel']) { const v = chipVal(c); if (S.chips[c] !== v) { S.chips[c] = v; changed = true; } }
  const bd = ($('#board') as HTMLSelectElement).value; if (bd && bd !== '__add' && S.board !== bd) { S.board = bd; changed = true; }
  if (changed) saveSettings();
  summaries();
}

/** The running workout's progress strip above the timer. `resting` = between exercises (run.i is the next one). */
function drawProgress(resting: boolean) {
  const el = $('#wprog'); el.classList.toggle('hide', !run); if (!run) return;
  const r = run, n = r.w.blocks.length, P = allProtos();
  el.innerHTML = `<div class="wprog-hd"><b>${esc(r.w.name || 'Workout')}</b><span>${resting ? `Up next: ${r.i + 1} of ${n}` : `Exercise ${r.i + 1} of ${n}`}</span></div>
    <div class="wprog-bar">${r.w.blocks.map((b, j) => `<i class="${j < r.i ? 'd' : j === r.i ? (resting ? 'n' : 'c') : ''}" title="${esc(P[b.proto]?.n ?? '')}"></i>`).join('')}</div>`;
}

/** Everything this climber has done, including the exercises finished so far in this workout. */
const priorSessions = (): Session[] => [
  ...(run?.done ?? []).map((d, j) => ({ ...d.s, id: `run${j}`, userId: state.me?.id ?? '', createdAt: d.s.createdAt! }) as Session).reverse(),
  ...mySessions(),
];
function recordBlock(log: HangResult[]) {
  const r = run!, b = r.w.blocks[r.i]!; if (!log.length) return;
  const s = makeSession(log, priorSessions(), new Date().toISOString());
  r.done.push({ blockId: b.id, name: allProtos()[b.proto]?.n ?? s.protocolName, s });
  backupRun();
}
function blockDone(log: HangResult[]) {
  recordBlock(log);
  if (run!.i < run!.w.blocks.length - 1) blockRest(); else workoutDone();
}
/** Rest before the next exercise. Skip ends it early; Edit changes the next exercise. */
function blockRest() {
  const r = run!, rest = Math.max(0, r.w.blocks[r.i]!.restAfter);
  loadBlock(r.i + 1);
  if (rest <= 0) { start(); return; } // no rest: straight into the next one, after its get-ready countdown
  const b = r.w.blocks[r.i]!, due = performance.now() + rest * 1000;
  timer = new SessionTimer([{ p: 'rest', t: rest, between: true }], { onTick: render, onPhase: phase, onWarn: () => beep(880), onDone: () => {
    // A rest that runs its course counts down into the first hang itself. One that was skipped, or that ran out
    // while the app was in the background (phone locked), starts with a get-ready countdown instead of dropping
    // straight into a hang the climber isn't on yet.
    const end = due + (timer?.pausedMs ?? 0), now = performance.now();
    if (now - end > 3000 || end - now > 500) val.ready = getReady();
    timer = null; start();
  } });
  timer.preWarn = preHang();
  $('#tmeta').textContent = `Up next: ${allProtos()[b.proto]!.n} · ${blockLine(b.vals)}`;
  $('#pause').innerHTML = `${ic('pause')} Pause`; hydrateIcons($('#pause'));
  drawProgress(true); show('timer'); timer.start();
}

async function quitRun(wasPaused: boolean, tappedAt: number) {
  const r = run!, t = timer!, between = !!t.step?.between;
  const here = !between && t.hasProgress(), n = r.done.length + (here ? 1 : 0), last = r.i >= r.w.blocks.length - 1;
  const opts: { label: string; kind: 'ghost' | 'primary' | 'danger'; a: string }[] = [{ label: 'Keep going 💪', kind: 'ghost', a: 'keep' }];
  if (!between && !last) opts.push({ label: 'Skip to the next exercise', kind: 'ghost', a: 'skip' });
  if (n) opts.push({ label: 'End workout early', kind: 'primary', a: 'end' });
  opts.push({ label: 'Give up 🏳️', kind: 'danger', a: 'quit' });
  const i = await sheet({
    title: 'End workout?',
    body: `<p class="sub">${n ? `<b>End workout early</b> saves the ${n > 1 ? `${n} exercises` : 'exercise'} you've done${here ? ' (this one counts for the hangs done so far)' : ''}. <b>Give up</b> saves nothing.` : "Nothing's been logged yet, so nothing will be saved."}</p>`,
    buttons: opts,
  });
  const a = opts[i]?.a ?? 'keep';
  if (timer !== t) return;
  slowBurn(t.longestPause()); // the sheet kept it paused too
  if (a === 'skip') { done(t.endEarly()); toast('On to the next exercise'); return; }
  if (a === 'end') { const log = t.endEarly(); timer = null; if (!between) recordBlock(log); workoutDone(); toast('Ended early. Here’s what you did'); return; }
  if (a === 'quit') {
    const n = r.done.length;
    if (n && !await confirmSheet('Give up?', `The ${n > 1 ? `${n} exercises` : 'exercise'} you’ve finished won’t be saved.`, 'Give up', 'Keep going')) {
      if (timer === t && !wasPaused) { t.resume(); togglePauseLabel(); }
      return;
    }
    if (timer !== t) return;
    if (!n) dramaticExit(tappedAt);
    t.stop(); timer = null; keepAwake(false); clearBackup(); endRun(); show('setup'); toast('Workout cancelled'); return;
  }
  if (!wasPaused) { t.resume(); togglePauseLabel(); }
}

function rpeLabel(r: HTMLInputElement) {
  const n = +r.value, out = r.parentElement!.querySelector('.rpev');
  if (out) out.innerHTML = `<small>${RW[n]}</small><b>${n}</b>`;
}
/** The summary at the end of a workout: totals, then each exercise with its own effort rating. */
function workoutDone(restored = false) {
  timer = null; keepAwake(false);
  const r = run!;
  if (!r.done.length) { clearBackup(); endRun(); show('setup'); toast('Nothing was logged, so there’s nothing to save'); return; }
  $('#wprog').classList.add('hide');
  const q = QUOTES[Math.floor(Math.random() * QUOTES.length)]!, all = r.done.map(d => d.s);
  const sum = (f: (s: NewSession) => number) => all.reduce((a, s) => a + f(s), 0);
  const short = sum(s => s.hangs.filter(h => !h.full).length), pbs = r.done.filter(d => d.s.isPb).map(d => d.name);
  const mine = mySessions(), first = all[0]!.createdAt!;
  $('#cheer').textContent = q[0]; $('#cheer2').textContent = q[1];
  $('#sTime').textContent = sum(s => s.tutS) + 's'; $('#sSets').textContent = `${sum(s => s.fullHangs)}/${sum(s => s.totalHangs)}`; $('#sPts').textContent = '+' + sum(s => s.points);
  $('#res').textContent = [`${r.done.length} exercise${r.done.length > 1 ? 's' : ''}`,
    short ? `${short} hang${short > 1 ? 's' : ''} cut short` : '✓ Every hang held full time',
    pbs.length ? `🏅 New personal best: ${[...new Set(pbs)].join(', ')}` : '',
    state.priv.bodyweightKg == null && all.some(s => s.mode !== 'lift') ? 'Add your bodyweight in Profile for fairer scoring' : '',
    mine.some(s => scoringDay(s.createdAt) === scoringDay(first)) ? 'Points add to what you’ve already trained today' : '',
  ].filter(Boolean).join(' · ');
  const progress = !!findWorkout(r.w.id);
  $('#wkRes').innerHTML = `<div class="rpe-hd"><span>How hard was each one?</span></div>` + r.done.map((d, j) => `<div class="wkr">
      <div class="wkr-hd"><label class="tname sm"><b>${j + 1}.</b><input data-tj="${j}" maxlength="${TITLE_MAX}" autocomplete="off" enterkeyhint="done" value="${esc(d.s.title || d.name)}" placeholder="${esc(d.name)}" aria-label="Name for exercise ${j + 1}, ${esc(d.name)}"><span class="tname-ic">${ic('edit')}</span></label><span>+${d.s.points}</span></div>
      <small>${d.s.fullHangs}/${d.s.totalHangs} full · ${d.s.tutS}s${d.s.isPb ? ' · 🏅 PB' : ''}</small>
      <div class="wkr-rpe"><input type="range" min="1" max="10" value="${d.s.rpe ?? 7}" class="rng" data-j="${j}" aria-label="Effort for ${esc(d.name)}, 1 to 10"><span class="rpev"></span></div></div>`).join('')
    + `<p class="dnote">${progress ? 'Rate one 5 or less and it gets 2.5kg heavier in this workout next time; 9 or more and it backs off 2.5kg.' : 'Your ratings are saved with each session.'} The note goes on the last exercise.</p>`;
  $$<HTMLInputElement>('#wkRes input[data-j]').forEach(rpeLabel);
  $('#rpeOne').classList.add('hide'); $('#wkRes').classList.remove('hide'); $('#sTitleW').classList.add('hide'); // each exercise has its own name
  $('#saveAsW').classList.toggle('hide', progress);
  $('#saveSess').textContent = `Save workout (${r.done.length} session${r.done.length > 1 ? 's' : ''})`;
  const fake = all.map((s, j) => ({ ...s, id: `run${j}`, userId: '', createdAt: s.createdAt! }) as Session);
  drawUnlocks(diffUnlocks(achievementCtx(), achievementCtx([...fake.reverse(), ...mine])));
  ($('#note') as HTMLInputElement).value = '';
  show('done'); if (!restored) { fanfare(); vibrate([100, 50, 100, 50, 300]); } confetti();
}

async function saveRun() {
  const r = run!, btn = $('#saveSess') as HTMLButtonElement; btn.disabled = true;
  try {
    const note = ($('#note') as HTMLInputElement).value.trim(), lib = findWorkout(r.w.id), P = allProtos(), next: string[] = [];
    let queuedAny = false, why = '';
    const failed: string[] = [];
    for (const [j, d] of r.done.entries()) {
      if (d.savedId) continue; // already saved by an earlier attempt that stopped part-way
      d.s.note = j === r.done.length - 1 ? note : '';
      const n = $<HTMLInputElement>(`#wkRes input[data-tj="${j}"]`); if (n) d.s.title = titleOf(n.value, d.name);
      let res: Awaited<ReturnType<typeof saveOrQueue>>;
      // Only data the server refuses throws (no signal queues it instead), so retrying can't help:
      // note it and carry on with the rest rather than leaving them stuck behind it.
      try { res = await saveOrQueue(d.s); } catch (e: any) { failed.push(d.name); why = e?.message ?? 'rejected'; continue; }
      const { session, queued } = res;
      d.savedId = session.id; queuedAny ||= queued;
      addSaved(session, queued);
      // the saved workout's exercise gets heavier or lighter from how it felt
      const lb = lib?.blocks.find(x => x.id === d.blockId), a = lb ? loadAdjust(d.s, P[d.s.protocolKey]) : null;
      if (lb && a) {
        lb.vals = { ...lb.vals, ...a.next };
        lb.adj = `${a.easier ? 'Felt easy' : 'Felt very hard'} last time, so ${'edge' in a.next ? 'the edge is' : 'it’s'} now ${a.what}`;
        next.push(`${d.name} ${a.what}`);
      }
      backupRun();
    }
    if (lib) { lib.lastRunAt = lib.updatedAt = Date.now(); }
    saveSettings(); clearBackup(); checkUnlocks();
    const n = r.done.length - failed.length; endRun();
    if (failed.length) toast(`Couldn’t save ${failed.join(', ')}: ${why}${n ? `. The other ${n} ${n > 1 ? 'were' : 'was'} saved.` : ''}`, 7000);
    else toast(queuedAny ? 'No signal, so it’s saved on this phone. It’ll upload automatically.' : `Workout saved: ${n} session${n > 1 ? 's' : ''}${next.length ? `. Next time: ${next.join(', ')}` : ''}`, queuedAny || next.length ? 4500 : 2500);
    show('setup'); go('stats');
  } catch (e: any) { toast(e.message ?? 'Could not save. Try again.'); }
  finally { btn.disabled = false; }
}

/** A one-off workout (started from the builder without saving) can be kept from its summary. */
async function saveRunAsWorkout() {
  const r = run; if (!r) return;
  const n = await promptSheet('Save as a workout', 'Keep this list of exercises to run again.', 'e.g. Tuesday strength', 'Save', r.w.name.trim());
  if (!n) return;
  r.w.name = n.slice(0, 60);
  const w = cloneWorkout(r.w); w.blocks.forEach(b => { delete b.adj; });
  if (w.blocks.length > MAX_BLOCKS) w.blocks = w.blocks.filter(b => b.id !== r.warmId);
  if (w.blocks.length > MAX_BLOCKS) { w.blocks = w.blocks.slice(0, MAX_BLOCKS); toast(`Workouts hold up to ${MAX_BLOCKS} exercises, so the last ones weren’t kept`, 4000); }
  upsertWorkout(w); state.settings.workoutSel = w.id; saveSettings();
  $('#saveAsW').classList.add('hide'); toast(`${r.w.name} saved to your workouts`);
}

/** Back to the Hang page as it was before the workout. */
function endRun() {
  run = null; editing = false;
  const S = state.settings;
  setChip('grip', S.chips.grip); setChip('fing', S.chips.fing);
  loadProto(S.proto);
  $('#wprog').classList.add('hide');
  layout(); drawWorkoutCard();
}

// A workout can run for most of an hour, so finished exercises are kept on this phone until saved.
// If the app is closed or reloaded before then, they're offered back next time.
const WIP = 'bf.wip';
function backupRun() {
  if (!run) return;
  try { localStorage.setItem(WIP, JSON.stringify({ owner: state.me?.id, at: Date.now(), w: run.w, done: run.done })); } catch { /* storage full/blocked */ }
}
function clearBackup() { try { localStorage.removeItem(WIP); } catch { /* blocked */ } }
interface Backup { owner?: string; at: number; w: Workout; done: DoneBlock[] }
/** Finished exercises from a workout that wasn't saved (only ones not already saved), or null. */
function readBackup(): { b: Backup; left: DoneBlock[] } | null {
  let b: Backup | null = null;
  try { b = JSON.parse(localStorage.getItem(WIP) || 'null'); } catch { /* blocked or corrupt */ }
  if (!b) return null;
  const left = (b.done ?? []).filter(d => !d.savedId);
  // the server takes sessions up to 7 days old; a day is plenty to come back for these
  if (b.owner !== state.me?.id || Date.now() - b.at > 24 * 3600e3 || !left.length || !b.w?.blocks) { clearBackup(); return null; }
  return { b, left };
}
/** Ask what to do with an unsaved workout: 'review' opens its summary, 'gone' = discarded or nothing to do, 'later' = dismissed. */
async function askBackup(starting: boolean): Promise<'review' | 'gone' | 'later'> {
  const x = readBackup(); if (!x) return 'gone';
  const { b, left } = x, n = left.length;
  const i = await sheet({
    title: 'Unsaved workout',
    body: `<p class="sub">You did ${n > 1 ? `${n} exercises` : 'an exercise'} of <b>${esc(b.w.name || 'a workout')}</b> but didn’t save ${n > 1 ? 'them' : 'it'}.${starting ? ' Save or discard them before starting another.' : ''}</p>`,
    buttons: [{ label: 'Discard', kind: 'ghost' }, { label: 'Review and save', kind: 'primary' }],
  });
  if (i === 0) { clearBackup(); return 'gone'; }
  if (i !== 1 || run || timer || pending) return 'later'; // dismissed: ask again next time
  run = { w: b.w, i: b.w.blocks.length - 1, done: left }; // only what isn't saved yet, so nothing counts twice
  workoutDone(true);
  return 'review';
}
async function offerRestore() { if (!run && !timer && !pending) await askBackup(false); }
/** Before another workout starts: true once nothing unsaved is left to lose. */
const settleBackup = async () => (await askBackup(true)) === 'gone';

// ---------------- from History: "do this again" ----------------
/** Load a past session's protocol and settings onto the Hang page, ready to start. */
export async function repeatSession(s: Session) {
  if (timer || run || pending) return toast('Finish or save your current session first');
  const P = allProtos(); if (!P[s.protocolKey]) return toast('That protocol has been deleted');
  if (!(await go('hang'))) return;
  const S = state.settings; S.hangMode = 'single';
  loadProto(s.protocolKey);
  Object.assign(val, sanitizeVals({ hang: s.hang, rest: s.rest, sets: s.sets, reps: s.reps, setRest: s.setRest, edge: s.edgeMm, mode: s.mode, hands: s.hands, effort: s.effortPct,
    ...(s.mode === 'lift' ? { lift: s.liftKg } : { add: s.addedKg, rem: s.assistKg }) }, val));
  setChip('mode', val.mode); setChip('hands', val.hands);
  for (const [k, v] of [['grip', s.grip], ['fing', s.fingers], ['mat', s.edgeMaterial], ['prof', s.edgeProfile]] as const)
    if (v && $$(`[data-k="${k}"] .chip`).some(c => c.dataset.v === v)) setChip(k, v);
  if (s.board && S.boards.list.includes(s.board)) ($('#board') as HTMLSelectElement).value = s.board;
  drawParams(); persist(); layout(); scrollTo(0, 0);
  toast(`${P[s.protocolKey]!.n} loaded with the settings you used`);
}

// ---------------- custom protocols deleted or renamed elsewhere ----------------
setSessionActiveCheck(() => !!timer || !!run || !!pending);
document.addEventListener('bf:protocols-changed', () => {
  if (!$('#proto') || run) return;
  protoOptions();
  // the selected protocol was deleted: fall back to Max Hangs, as a fresh start would
  if (!allProtos()[cur]) { loadProto('max'); persist(); }
  else { drawProtoBtn(); $('#protoHint').innerHTML = hint(allProtos()[cur]!); hydrateIcons($('#protoHint')); }
  drawWorkoutCard();
});
