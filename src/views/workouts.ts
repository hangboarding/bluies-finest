// Workouts tab: the saved workouts (with a builder to make and change them), custom protocols,
// starter workouts, and the history of every session logged.
import { $, $$, esc, sheet, confirmSheet, promptSheet, toast, relTime, onSwipe, slideIn } from '../lib/ui';
import { ic, hydrateIcons } from '../lib/icons';
import { state, mySessions, saveSettings, allProtos } from '../lib/state';
import { personalVals, GRIPS, FINGERS, MATERIALS, PROFILES, FEELS, RPE_WORDS } from '../lib/protocols';
import { sessionPoints, loadPct, liftPct, rescoreDay, scoringDay } from '../lib/scoring';
import type { Session } from '../lib/types';
import { TEMPLATES, fromTemplate, cloneWorkout, newId, workoutTotals, fmtLength, protoValues, blockLine, type Workout } from '../lib/workouts';
import { drawQueue, addExercise, libWorkouts, findWorkout, upsertWorkout, removeWorkout, totalsLine, getReadySecs, workoutsUsing, deleteCustomProto, renameCustomProto } from './workout-parts';
import { sessRow } from './stats';
import { beginWorkout, repeatSession } from './hang';
import { go } from '../main';
import { checkUnlocks } from './unlocks';

let root: HTMLElement | null = null;
/** The workout open in the builder (a copy until saved), or null for the list. */
let draft: Workout | null = null, isNew = false, baseline = '';
/** The saved version the draft started from (null for a new one). It tells the builder's own edits apart from
 *  changes made elsewhere since (a run's load changes, mid-workout edits, a deleted protocol). */
let base: Workout | null = null;
let histN = 10;

const swipeable = new WeakSet<HTMLElement>();
export function renderWorkouts(el: HTMLElement) {
  root = el;
  // in the workout editor, swiping right goes back (like ‹ Go back)
  if (!swipeable.has(el)) { swipeable.add(el); onSwipe(el, dir => { if (draft && dir === 'right') closeBuilder(); }); }
  if (draft && base && !dirty()) {
    // Nothing edited here yet: show the saved workout as it is now, since it may have changed since it was opened.
    const lib = findWorkout(draft.id);
    if (!lib) draft = base = null;
    else if (JSON.stringify(lib) !== JSON.stringify(base)) { draft = cloneWorkout(lib); base = cloneWorkout(lib); baseline = JSON.stringify(draft); }
  }
  if (draft) drawBuilder(); else drawLibrary();
}

/** Open the builder: an existing workout, a new one from a template (`fresh`), or an empty one (null). Switches to this tab. */
export async function openBuilder(w?: Workout | null, fresh = false) {
  // the same workout is already open: carry on with it, unsaved edits and all
  if (draft && w && !fresh && draft.id === w.id) { go('workouts'); return; }
  if (draft && dirty() && draft.blocks.length
    && !await confirmSheet('Discard changes?', `Your unsaved changes to “${esc(draft.name.trim() || 'the new workout')}” will be lost.`, 'Discard', 'Keep editing')) { go('workouts'); return; }
  draft = w ? cloneWorkout(w) : { id: newId('w'), name: '', blocks: [], updatedAt: Date.now() };
  if (fresh && w) draft.id = newId('w');
  isNew = fresh || !w || !findWorkout(w.id);
  base = isNew ? null : cloneWorkout(findWorkout(w!.id)!);
  baseline = fresh ? '' : JSON.stringify(draft); // a template isn't saved yet, so it counts as changed
  go('workouts');
}

// ---------- the list ----------
const ago = (ms: number) => { const t = relTime(new Date(ms).toISOString()); return t === 'Yesterday' ? 'yesterday' : t; };
function drawLibrary() {
  const el = root!, L = libWorkouts(), S = state.settings;
  el.innerHTML = `
  <div class="card"><h3>${ic('workouts')} My workouts</h3>
    <div id="wkLib">${L.length ? L.map(w => `<div class="lrow wkrow" data-w="${esc(w.id)}">
        <button type="button" class="nm wk-open" data-open><b>${esc(w.name)}</b><small>${esc(totalsLine(w))}${w.lastRunAt ? ` · last done ${ago(w.lastRunAt)}` : ''}</small></button>
        <button type="button" class="pill" data-start aria-label="Start ${esc(w.name)}">${ic('play')} Start</button></div>`).join('')
      : '<p class="sub">A workout is a list of protocols you run back to back, with rest between them. Each one is saved as its own session, so points and personal bests work just the same.</p>'}</div>
    <button class="big" id="wkNew" style="margin-top:12px">${ic('plus')} New workout</button></div>
  ${myProtocols()}
  <details class="card panel" data-p="tpl"><summary>${ic('sparkles')} Starter workouts<small>Make one your own</small></summary>
    <div id="wkTpl">${TEMPLATES.map(t => { const w = fromTemplate(t, allProtos(), S.vals);
      return `<div class="lrow"><span class="nm"><b>${esc(t.name)}</b><small>${esc(t.desc)}<br>${w.blocks.map(b => esc(allProtos()[b.proto]!.n)).join(' → ')} · ${fmtLength(workoutTotals(w, allProtos(), getReadySecs()).secs)}</small></span>
        <button type="button" class="pill" data-tpl="${t.key}">Use</button></div>`; }).join('')}</div></details>
  <div class="card"><h3>${ic('history')} History</h3><div id="recent"></div></div>`;
  const d = $<HTMLDetailsElement>('details[data-p="tpl"]', el);
  d.open = S.panels.tpl ?? !L.length;
  d.addEventListener('toggle', () => { S.panels.tpl = d.open; saveSettings(); });
  drawHistory();
  hydrateIcons(el);
  el.onclick = onLibraryClick;
}

/** Custom protocols, to rename or delete. Only shown once there are some. */
function myProtocols() {
  const S = state.settings, C = Object.entries(S.customProtos);
  if (!C.length) return '';
  return `<div class="card"><h3>${ic('star')} My protocols</h3><div id="wkProtos">${C.map(([k, p]) => {
    const n = workoutsUsing(k).length;
    return `<div class="lrow" data-proto="${esc(k)}"><span class="nm"><b>${esc(p.n)}</b><small>${esc(blockLine(protoValues(p, personalVals(k, S.vals[k]))))}${n ? ` · in ${n} workout${n > 1 ? 's' : ''}` : ''}</small></span>
      <button type="button" class="ed" data-rename aria-label="Rename ${esc(p.n)}">${ic('edit')}</button><button type="button" class="ed" data-delp aria-label="Delete ${esc(p.n)}">${ic('trash')}</button></div>`;
  }).join('')}</div><p class="sub wb-tip">Make new ones with “Custom exercise…” at the top of the protocol list.</p></div>`;
}

async function onLibraryClick(e: MouseEvent) {
  const t = e.target as HTMLElement;
  const pr = t.closest('#wkProtos .lrow') as HTMLElement | null;
  if (pr) {
    const k = pr.dataset.proto!;
    if (t.closest('[data-delp]')) deleteCustomProto(k);
    else if (t.closest('[data-rename]')) renameCustomProto(k);
    return; // the list redraws itself when they change (bf:protocols-changed)
  }
  const wrow = t.closest('.wkrow') as HTMLElement | null, w = wrow ? findWorkout(wrow.dataset.w) : undefined;
  if (w && t.closest('[data-start]')) { beginWorkout(cloneWorkout(w)); return; }
  if (w && t.closest('[data-open]')) { openBuilder(w); return; }
  if (t.closest('#wkNew')) { openBuilder(null); return; }
  const tp = t.closest('[data-tpl]') as HTMLElement | null;
  if (tp) { const x = TEMPLATES.find(y => y.key === tp.dataset.tpl); if (x) openBuilder(fromTemplate(x, allProtos(), state.settings.vals), true); return; }
  if (t.closest('#histMore')) { histN += 20; drawHistory(); return; }
  const row = t.closest('#recent .lrow') as HTMLElement | null;
  if (!row) return;
  const s = mySessions().find(x => x.id === row.dataset.sid); if (!s) return;
  if (t.closest('[data-again]')) repeatSession(s);
  else if (t.closest('[data-del]')) deleteSession(s);
  else if (t.closest('[data-ed]')) editSession(s);
}

// ---------- history ----------
function drawHistory() {
  const el = $('#recent'); if (!el) return;
  const mine = mySessions();
  el.innerHTML = mine.length
    ? mine.slice(0, histN).map(s => sessRow(s, true)).join('') + (mine.length > histN ? `<button type="button" class="linkbtn hist-more" id="histMore">Show more (${mine.length - histN} older)</button>` : '')
    : '<p class="sub">No sessions yet. Head to Hang to log your first.</p>';
  hydrateIcons(el);
}

async function deleteSession(s: Session) {
  if (!await confirmSheet('Delete session?', 'Its points and stats will be removed. This can’t be undone.', 'Delete')) return;
  try {
    await state.store.deleteSession(s.id);
    state.sessions = state.sessions.filter(x => x.id !== s.id);
    rescoreDay(state.sessions, s.userId, scoringDay(s.createdAt));
    toast('Session deleted'); drawHistory();
  } catch (err: any) { toast(err.message); }
}

/** Edit a logged session: its load and edge, how it was done (grip, fingers, board, edge, feel) and how it felt.
 *  The timings and the hang-by-hang log come from the timer, so they're shown but can't be changed. */
async function editSession(s: Session) {
  let el!: HTMLElement;
  const B = state.settings.boards.list, boards = s.board && !B.includes(s.board) ? [s.board, ...B] : B;
  // `only`: shown just for a hang or just for a lift (the Load method switch swaps them)
  const num = (k: string, label: string, v: number, step = '0.5', only = '') => `<div${only ? ` data-for="${only}"${only !== s.mode ? ' class="hide"' : ''}` : ''}><label class="f">${label}</label><input class="tx" data-f="${k}" type="number" inputmode="decimal" step="${step}" value="${esc(v)}"></div>`;
  const chips = (k: string, opts: string[], cur: string, cls: string, show: (v: string) => string = esc) =>
    `<div class="chips g ${cls}" data-sk="${k}">${opts.map(v => `<span class="chip${v === cur ? ' on' : ''}" data-v="${esc(v)}" role="button" tabindex="0" aria-pressed="${v === cur}">${show(v)}</span>`).join('')}</div>`;
  const when = new Date(s.createdAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const shape = s.mode === 'lift' ? `${s.hang}s lifts` : `${s.hang}s hangs`;
  const sets = `${s.sets} set${s.sets === 1 ? '' : 's'}${s.reps > 1 ? ` × ${s.reps} reps` : ''}`;
  const i = await sheet({
    title: 'Edit session', autofocus: false,
    body: `<div class="bedit sedit">
      <p class="sedit-sum"><b>${esc(s.protocolName)}</b> · ${esc(when)}<small>${esc([shape, `${s.rest}s rest`, sets, ({ both: 'both hands', L: 'left hand', R: 'right hand', LR: 'left then right' } as const)[s.hands], `${s.tutS}s under tension`, `${s.fullHangs}/${s.totalHangs} full`].join(' · '))}</small>
        <small class="sedit-why">Times and hangs come from the timer, so they stay as they were.</small></p>
      <h4>${ic('add')} Load</h4>
      <label class="f">Load method</label>${chips('mode', ['hang', 'lift'], s.mode, 'g2', v => (v === 'hang' ? 'Hang (on board)' : 'No-hang (lift)'))}
      <p class="sub sedit-lift${s.mode === 'lift' ? '' : ' hide'}" data-for="lift">A lift counts only the weight lifted (plates, a dumbbell), not your bodyweight.</p>
      <div class="split">${num('edgeMm', 'Edge (mm)', s.edgeMm, '1')}${num('addedKg', 'Added (kg)', s.addedKg, '0.5', 'hang')}${num('liftKg', 'Weight lifted (kg)', s.liftKg, '0.5', 'lift')}</div>
      <div class="split">${num('assistKg', 'Assist (kg)', s.assistKg, '0.5', 'hang')}${num('effortPct', 'Target effort (%)', s.effortPct, '5', 'lift')}<div></div></div>
      <h4>${ic('grip')} Grip</h4>
      <label class="f">Grip type</label>${chips('grip', GRIPS.map(g => g[0]), s.grip, 'g6 tile', v => `<em>${ic(GRIPS.find(g => g[0] === v)![1])}</em>${esc(v)}`)}
      <label class="f">Fingers</label>${chips('fingers', FINGERS, s.fingers, 'g4')}
      <h4>${ic('board')} Setup</h4>
      <label class="f">Board</label><select data-f="board"><option value=""${s.board ? '' : ' selected'}>Not set</option>${boards.map(b => `<option${b === s.board ? ' selected' : ''}>${esc(b)}</option>`).join('')}</select>
      <label class="f">Edge material</label>${chips('edgeMaterial', MATERIALS, s.edgeMaterial, 'g4')}
      <label class="f">Edge profile</label>${chips('edgeProfile', PROFILES, s.edgeProfile, 'g2')}
      <h4>${ic('feel')} How it went</h4>
      <label class="f">Pre-session feel</label>${chips('feel', FEELS, s.feel, 'g8 feel', v => ic(v))}
      <div class="rpe-hd"><span>How hard was it?</span><span class="rpev" id="seRpeV"></span></div>
      <input type="range" min="1" max="10" value="${s.rpe ?? 7}" class="rng" data-f="rpe" aria-label="Effort, 1 to 10"${s.rpe == null ? ' data-unset' : ''}>
      <label class="f">Note</label><textarea class="tx" data-f="note" maxlength="2000" rows="3" placeholder="Add a note for the feed (optional)">${esc(s.note)}</textarea>
    </div>`,
    buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Save', kind: 'primary' }],
    onMount: e => {
      el = e; hydrateIcons(el);
      const rpe = $<HTMLInputElement>('[data-f="rpe"]', el), out = $('#seRpeV', el);
      const label = () => { out.innerHTML = rpe.dataset.unset != null ? '<small>Not rated</small>' : `<small>${RPE_WORDS[+rpe.value]}</small><b>${rpe.value}</b>`; };
      rpe.addEventListener('input', () => { delete rpe.dataset.unset; label(); }); label();
      // tap to pick, tap the picked one again to leave it blank (a session is always a hang or a lift, though)
      el.addEventListener('click', ev => {
        const c = (ev.target as HTMLElement).closest('[data-sk] .chip') as HTMLElement | null; if (!c) return;
        const isMode = (c.parentElement as HTMLElement).dataset.sk === 'mode', on = isMode || !c.classList.contains('on');
        $$('.chip', c.parentElement!).forEach(x => { x.classList.toggle('on', x === c && on); x.setAttribute('aria-pressed', String(x === c && on)); });
        if (isMode) $$<HTMLElement>('[data-for]', el).forEach(x => x.classList.toggle('hide', x.dataset.for !== c.dataset.v));
      });
    },
  });
  if (i !== 1) return;
  const LIM: Record<string, [number, number]> = { edgeMm: [3, 60], liftKg: [0, 200], addedKg: [0, 150], assistKg: [0, 150], effortPct: [0, 100] };
  const patch: Record<string, any> = {};
  const mode = ($('[data-sk="mode"] .chip.on', el) as HTMLElement | null)?.dataset.v === 'lift' ? 'lift' : 'hang';
  for (const inp of $$<HTMLInputElement>('input[type="number"][data-f]', el)) {
    const only = (inp.closest('[data-for]') as HTMLElement | null)?.dataset.for;
    if (only && only !== mode) continue; // the other kind's numbers (zeroed below)
    const k = inp.dataset.f!, raw = inp.value.trim().replace(',', '.');
    if (raw === '') continue; // leave a cleared box as it was
    const n = +raw, [lo, hi] = LIM[k]!;
    if (!isFinite(n) || n < lo || n > hi) { toast(`Check that value. It must be ${lo}–${hi}`); return; }
    if (n !== (s as any)[k]) patch[k] = n;
  }
  for (const g of $$('[data-sk]', el)) { const v = ($('.chip.on', g) as HTMLElement | null)?.dataset.v ?? ''; if (v !== (s as any)[g.dataset.sk!]) patch[g.dataset.sk!] = v; }
  // a lift has no added weight or assist (it's only the weight lifted), and a hang has no weight lifted
  if (mode === 'lift') { if (s.addedKg) patch.addedKg = 0; if (s.assistKg) patch.assistKg = 0; } else if (s.liftKg) patch.liftKg = 0;
  const board = $<HTMLSelectElement>('select[data-f="board"]', el).value; if (board !== s.board) patch.board = board;
  const rpe = $<HTMLInputElement>('[data-f="rpe"]', el); if (rpe.dataset.unset == null && +rpe.value !== s.rpe) patch.rpe = +rpe.value;
  const note = $<HTMLTextAreaElement>('[data-f="note"]', el).value.trim().slice(0, 2000); if (note !== s.note) patch.note = note;
  if (!Object.keys(patch).length) { toast('Nothing changed'); return; }
  // Only recompute % bodyweight if the load changed (and with current bodyweight — the best we have, as the server does).
  const bw = state.priv.bodyweightKg, next = { ...s, ...patch } as Session;
  if (next.mode !== s.mode || next.addedKg !== s.addedKg || next.assistKg !== s.assistKg || next.liftKg !== s.liftKg)
    patch.loadPct = next.loadPct = next.mode === 'lift' ? liftPct(bw, next.liftKg) : loadPct(bw, next.addedKg, next.assistKg);
  patch.points = next.points = sessionPoints(next, state.sessions.filter(x => x.userId === s.userId));
  let skipped = false;
  try {
    try { await state.store.updateSession(s.id, patch); }
    catch (e: any) {
      // A database that hasn't had the latest supabase/schema.sql only lets load, edge, effort rating and note change:
      // save those, and say what's left.
      if (e?.code === '42501' && 'mode' in patch) throw new Error('Switching a session between a hang and a lift needs the latest database update. Ask an admin to run supabase/schema.sql.');
      if (e?.code !== '42501' || !DESCRIPTIVE.some(k => k in patch)) throw e;
      for (const k of DESCRIPTIVE) delete patch[k];
      skipped = true;
      await state.store.updateSession(s.id, patch);
    }
    Object.assign(s, patch); // apply locally only once the save succeeded
    rescoreDay(state.sessions, s.userId, scoringDay(s.createdAt)); // later sessions that day change too (the server does the same)
    toast(skipped ? 'Load and note saved. Grip, board, edge and feel can be changed once an admin runs the latest supabase/schema.sql.' : 'Session updated', skipped ? 6000 : 2200);
    drawHistory(); checkUnlocks();
  } catch (e: any) { toast(e.message ?? 'Could not save'); }
}
/** Session fields that describe how it was done; editable since the November 2026 schema update. */
const DESCRIPTIVE = ['grip', 'fingers', 'board', 'edgeMaterial', 'edgeProfile', 'feel', 'effortPct'];

// ---------- the builder ----------
const dirty = () => !!draft && JSON.stringify(draft) !== baseline;
function drawBuilder() {
  const el = root!, w = draft!;
  el.innerHTML = `
  <button type="button" class="backbtn" id="wbBack">‹ Go back</button>
  <div class="card"><label class="f" for="wbName">Workout name</label>
    <input class="tx" id="wbName" maxlength="60" placeholder="e.g. Tuesday strength" value="${esc(w.name)}" autocomplete="off"></div>
  <div class="card"><div class="wq-hd"><h3>${ic('workouts')} Exercises</h3><small id="wbTot"></small></div>
    <div id="wbQ"></div>
    <button class="big ghost" id="wbAdd" style="margin-top:10px">${ic('plus')} Add exercise</button>
    <p class="sub wb-tip">Tap an exercise to change it, drag ${ic('handle')} to reorder, or tap a rest to change it.</p></div>
  <div class="row"><button class="big ghost" id="wbStart">${ic('play')} Start now</button><button class="big" id="wbSave">${isNew ? 'Save workout' : 'Save changes'}</button></div>
  ${isNew ? '' : '<div class="links"><a id="wbDup" role="button" tabindex="0">Duplicate</a><a id="wbDel" class="danger-text" role="button" tabindex="0">Delete workout</a></div>'}`;
  const q = () => {
    drawQueue($('#wbQ'), w, { structure: true, onChange: q });
    $('#wbTot').textContent = totalsLine(w);
    ($('#wbStart') as HTMLButtonElement).disabled = !w.blocks.length;
  };
  q();
  hydrateIcons(el);
  $('#wbName').addEventListener('input', e => { w.name = (e.target as HTMLInputElement).value; });
  el.onclick = async e => {
    const t = e.target as HTMLElement;
    if (t.closest('#wbBack')) { closeBuilder(); return; }
    if (t.closest('#wbAdd')) { if (await addExercise(w)) q(); return; }
    if (t.closest('#wbSave')) { if (await saveDraft()) { toast(`${draft!.name} saved`); draft = base = null; drawLibrary(); scrollTo(0, 0); } return; }
    if (t.closest('#wbStart')) { startDraft(); return; }
    if (t.closest('#wbDup')) {
      const copy = { ...cloneWorkout(w), name: `${w.name.trim() || 'Workout'} (copy)`.slice(0, 60) };
      draft = base = null; // any unsaved edits go into the copy, so there's nothing to ask about
      openBuilder(copy, true);
      toast('Copy made. Save it to keep it.'); return;
    }
    if (t.closest('#wbDel')) {
      if (!await confirmSheet('Delete workout?', `“${esc(w.name || 'This workout')}” will be removed. Sessions you’ve already logged with it stay.`, 'Delete')) return;
      removeWorkout(w.id); draft = base = null; toast('Workout deleted'); drawLibrary(); scrollTo(0, 0);
    }
  };
}

/** The draft as it should be saved. Exercises edited here win; ones not touched here take the saved workout's
 *  current version (so a run's load changes and mid-workout edits since it was opened aren't undone), and ones
 *  whose protocol has been deleted are dropped. */
function rebased(d: Workout): Workout {
  const P = allProtos(), lib = findWorkout(d.id);
  const was = new Map((base?.blocks ?? []).map(b => [b.id, JSON.stringify(b)])), now = new Map((lib?.blocks ?? []).map(b => [b.id, b]));
  return {
    ...d, ...(lib?.lastRunAt ? { lastRunAt: lib.lastRunAt } : {}),
    blocks: d.blocks.filter(b => P[b.proto]).map(b => (was.get(b.id) === JSON.stringify(b) && now.has(b.id) ? JSON.parse(JSON.stringify(now.get(b.id))) : b)),
  };
}
/** Save the draft as it stands into the library, and carry on from what was saved. */
function commitDraft() {
  const out = rebased(draft!);
  upsertWorkout(out); state.settings.workoutSel = out.id; saveSettings();
  draft = cloneWorkout(out); base = cloneWorkout(findWorkout(out.id)!); isNew = false; baseline = JSON.stringify(draft);
}
/** Save the draft to the library, asking for a name if it has none. */
async function saveDraft(): Promise<boolean> {
  const w = draft!; w.name = w.name.trim();
  if (!w.blocks.length) { toast('Add at least one exercise'); return false; }
  if (!w.name) {
    const n = await promptSheet('Name this workout', 'So you can find it again.', 'e.g. Tuesday strength');
    if (!n) return false;
    w.name = n.slice(0, 60); const i = $('#wbName') as HTMLInputElement | null; if (i) i.value = w.name;
  }
  commitDraft();
  return true;
}

/** Start the draft. A saved workout keeps its changes; a new one runs as a one-off (it can be saved from the summary). */
async function startDraft() {
  if (!draft!.blocks.length) return toast('Add at least one exercise');
  if (!isNew && dirty()) { draft!.name = draft!.name.trim() || findWorkout(draft!.id)?.name || 'Workout'; commitDraft(); }
  const copy = cloneWorkout({ ...draft!, name: draft!.name.trim() });
  if (await beginWorkout(copy)) { draft = base = null; if (root) drawLibrary(); }
  else if (root && draft) drawBuilder(); // not started (a safety check said no): the builder shows what was saved
}

async function closeBuilder() {
  if (dirty() && draft!.blocks.length) {
    const i = await sheet({ title: isNew ? 'Save this workout?' : 'Save your changes?', body: '<p class="sub">You’ve made changes that aren’t saved yet.</p>',
      buttons: [{ label: 'Discard', kind: 'ghost' }, { label: 'Save', kind: 'primary' }] });
    if (i === -1) return;
    if (i === 1 && !(await saveDraft())) return;
  }
  draft = base = null; drawLibrary(); scrollTo(0, 0); slideIn(root!, 'right');
}

// A custom protocol was deleted or renamed (here or from the Hang page's picker): redraw the list it shows in.
document.addEventListener('bf:protocols-changed', () => { if (root && !draft && root.querySelector('#wkLib')) drawLibrary(); });
