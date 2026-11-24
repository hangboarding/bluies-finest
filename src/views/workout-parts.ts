// Pieces shared by the Hang page and the Workouts tab: the saved-workout library, custom protocols
// (create, rename, delete), the exercise list with drag-to-reorder, and the exercise, rest and
// "add an exercise" sheets.
import { esc, sheet, closeSheet, confirmSheet, promptSheet, toast, vibrate } from '../lib/ui';
import { ic, hydrateIcons } from '../lib/icons';
import { PROTOCOLS, FIELDS, LIMITS, GRIPS, FINGERS, personalVals, type FieldKey, type Protocol, type Values } from '../lib/protocols';
import { state, saveSettings, allProtos } from '../lib/state';
import { handsLabel } from '../lib/timer';
import { checkUnlocks } from './unlocks';
import {
  type Workout, type WorkoutBlock, type BlockVals, blockValues, blockLine, sanitizeVals, fmtRest, fmtLength, workoutTotals,
  moveItem, clamp, newId, makeBlock, cloneWorkout, MAX_BLOCKS, REST_LIMITS,
} from '../lib/workouts';

export const protoLabel = (k: string, p: Protocol) => `${p.simple ? '⚡ ' : p.custom || k.startsWith('c_') ? '★ ' : ''}${esc(p.n)}`;

// ---------- the library (in settings) ----------
export const libWorkouts = () => state.settings.workouts;
export const findWorkout = (id?: string | null) => id ? libWorkouts().find(w => w.id === id) : undefined;
/** Add or replace a workout in the library (stored as a copy) and save settings. */
export function upsertWorkout(w: Workout) {
  const copy = cloneWorkout({ ...w, updatedAt: Date.now() }), L = libWorkouts(), i = L.findIndex(x => x.id === w.id);
  if (i >= 0) L[i] = copy; else L.unshift(copy);
  saveSettings();
}
/** Remember a deletion so it syncs: otherwise another device's older copy would bring it back. */
const markDeleted = (id: string) => { state.settings.deleted = { ...(state.settings.deleted ?? {}), [id]: Date.now() }; };
export function removeWorkout(id: string) {
  state.settings.workouts = libWorkouts().filter(w => w.id !== id);
  markDeleted(id);
  if (state.settings.workoutSel === id) state.settings.workoutSel = state.settings.workouts[0]?.id;
  saveSettings();
}
export const getReadySecs = () => { const v = state.settings.prefs.ready; return v == null ? 10 : clamp(Math.round(v), LIMITS.ready!); };
export function totalsLine(w: Workout) {
  const n = w.blocks.length; if (!n) return 'No exercises yet';
  const t = workoutTotals(w, allProtos(), getReadySecs());
  return `${n} exercise${n === 1 ? '' : 's'} · ${fmtLength(t.secs)} · ${t.hangs} hang${t.hangs === 1 ? '' : 's'}`;
}

/** Save timer settings as a new custom protocol. Returns its key. */
export function createCustomProto(name: string, v: BlockVals): string {
  const k = newId('c_'); // two made in the same millisecond mustn't share a key
  state.settings.customProtos[k] = { n: name.slice(0, 60), by: `Custom, by ${state.me?.name ?? 'you'}`, use: 'Your own plan', d: 'Your saved protocol.', int: 'Your call', freq: 'Your call', custom: true,
    hang: v.hang, rest: v.rest, sets: v.sets, reps: v.reps, setRest: v.setRest, edge: v.edge, mode: v.mode, hands: v.hands, sw: v.sw, effort: v.effort };
  state.settings.vals[k] = { add: v.add, rem: v.rem, lift: v.lift };
  saveSettings(); protosChanged(); checkUnlocks(); // Mad Scientist
  return k;
}

// ---------- managing custom protocols ----------
/** Set by the Hang page: true while a session or workout is running, paused for Edit, or waiting to be saved. */
let sessionActive = () => false;
export const setSessionActiveCheck = (f: () => boolean) => { sessionActive = f; };
/** Tell open screens (Hang page, Workouts tab) that the custom protocols changed. */
const protosChanged = () => document.dispatchEvent(new CustomEvent('bf:protocols-changed'));
export const workoutsUsing = (k: string) => libWorkouts().filter(w => w.blocks.some(b => b.proto === k));

/** Delete a custom protocol, and take it out of any workout that uses it. Sessions already logged with it
 *  keep their name. Not while something's running: a workout mid-way would lose an exercise. Resolves true when deleted. */
export async function deleteCustomProto(k: string): Promise<boolean> {
  const S = state.settings, p = S.customProtos[k]; if (!p) return false;
  if (sessionActive()) { toast('Finish or save your current session first'); return false; }
  const used = workoutsUsing(k);
  const also = !used.length ? '' : used.length === 1 ? ` It’s also taken out of your workout “${esc(used[0]!.name)}”.` : ` It’s also taken out of ${used.length} of your workouts.`;
  if (!await confirmSheet('Delete protocol?', `“${esc(p.n)}” will be removed.${also} Sessions you’ve already logged with it stay.`, 'Delete')) return false;
  dropCustomProto(k);
  for (const w of used) { w.blocks = w.blocks.filter(b => b.proto !== k); w.updatedAt = Date.now(); }
  saveSettings(); protosChanged();
  toast(`${p.n} deleted`);
  return true;
}
function dropCustomProto(k: string) {
  const S = state.settings;
  delete S.customProtos[k]; delete S.vals[k]; if (S.suggest) delete S.suggest[k];
  if (S.returnTo === k) delete S.returnTo;
  markDeleted(k);
}
/** Rename a custom protocol. Sessions already logged keep the name they were saved with. */
export async function renameCustomProto(k: string): Promise<boolean> {
  const p = state.settings.customProtos[k]; if (!p) return false;
  const n = (await promptSheet('Rename protocol', 'Sessions you’ve already logged keep the old name.', 'Protocol name', 'Save', p.n))?.trim();
  if (!n || n === p.n) return false;
  p.n = n.slice(0, 60);
  saveSettings(); protosChanged();
  return true;
}

// ---------- make your own ----------
/** "➕ Custom exercise…", first in both protocol lists (the Hang page's and "Add an exercise"). */
export const customOption = () => `<button type="button" class="protoopt protonew" data-k="__new"><b>➕ Custom exercise…</b><small>Set your own hang, rest and sets. It’s saved to My protocols.</small></button>
      <p class="protogrp">Protocols</p>`;
/** Make your own protocol: name it, then set its numbers in the exercise editor, starting from `start`.
 *  The same everywhere it's offered. Resolves with its key and the exercise as set, or null if cancelled. */
export async function newCustomExercise(start: WorkoutBlock): Promise<{ key: string; block: WorkoutBlock } | null> {
  const name = await promptSheet('Custom exercise', 'Name it, then set its hang, rest and sets.', 'e.g. Long hangs on 25mm');
  if (!name) return null;
  const S = state.settings, ck = createCustomProto(name, start.vals);
  const r = await editBlock({ ...start, proto: ck }, { index: 0, count: 1, structure: false });
  if (!r) { dropCustomProto(ck); saveSettings(); protosChanged(); return null; } // cancelled: don't keep a protocol nobody set up
  const v = r.block.vals;
  // the protocol takes the values chosen here, so it's the same wherever it's picked later
  Object.assign(S.customProtos[ck]!, { hang: v.hang, rest: v.rest, sets: v.sets, reps: v.reps, setRest: v.setRest, edge: v.edge, mode: v.mode, hands: v.hands, sw: v.sw, effort: v.effort });
  S.vals[ck] = { add: v.add, rem: v.rem, lift: v.lift };
  saveSettings(); protosChanged();
  toast(`★ ${name} saved to My protocols`);
  return { key: ck, block: r.block };
}

// ---------- pick an exercise ----------
/** Protocol list to add from. Resolves with a protocol key, '__new' for a custom exercise, or null. */
async function pickExercise(): Promise<string | null> {
  const P = allProtos(), custom = Object.keys(state.settings.customProtos);
  const item = (k: string) => `<button type="button" class="protoopt" data-k="${k}"><b>${protoLabel(k, P[k]!)}</b><small>${esc(P[k]!.use)}</small></button>`;
  let picked: string | null = null;
  await sheet({
    title: 'Add an exercise',
    body: `<div class="protolist full">${customOption()}${Object.keys(PROTOCOLS).map(item).join('')}
      ${custom.length ? `<p class="protogrp">My protocols</p>${custom.map(item).join('')}` : ''}</div>`,
    onMount: el => el.querySelector('.protolist')!.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest('.protoopt') as HTMLElement | null; if (!b) return;
      picked = b.dataset.k!; closeSheet(el);
    }),
  });
  return picked;
}

/** Add an exercise to the end of `w` (asks which). Resolves true when one was added. */
export async function addExercise(w: Workout): Promise<boolean> {
  if (w.blocks.length >= MAX_BLOCKS) { toast(`Up to ${MAX_BLOCKS} exercises per workout`); return false; }
  const k = await pickExercise(); if (!k) return false;
  const S = state.settings, chips = { grip: S.chips.grip || undefined, fing: S.chips.fing || undefined };
  // a new exercise starts from the protocol's recommended settings, with your load for it
  if (k !== '__new') { w.blocks.push(makeBlock(k, allProtos()[k]!, personalVals(k, S.vals[k]), chips)); return true; }
  const made = await newCustomExercise(makeBlock('jlmh', { ...PROTOCOLS.jlmh!, simple: false, rest: 60, sets: 5 }, undefined, chips));
  if (!made) return false;
  w.blocks.push(made.block);
  return true;
}

// ---------- number steppers (same look as the Hang page) ----------
function paramsHtml(v: Values) {
  return FIELDS.filter(f => !f.show || f.show(v)).map(f => {
    const off = (f.k === 'add' && v.rem > 0) || (f.k === 'rem' && v.add > 0);
    const label = f.k === 'rest' && v.reps > 1 ? 'Rest between reps' : f.k === 'sets' && v.hands === 'LR' ? 'Sets (each hand)' : f.label;
    return `<div class="prm ${off ? 'off' : ''}" style="--c:${f.colour}"><div class="hd"><span class="ic">${ic(f.icon)}</span>${label}</div>
      <div class="step"><button type="button" data-pk="${f.k}" data-d="-1" aria-label="Decrease ${label}">−</button><input data-pi="${f.k}" value="${v[f.k]}" inputmode="decimal" aria-label="${label}"><small>${f.unit}</small><button type="button" data-pk="${f.k}" data-d="1" aria-label="Increase ${label}">+</button></div></div>`;
  }).join('');
}
/** Tap to step once, press and hold to repeat (faster the longer you hold); typed values are clamped.
 *  Returns a function that reads every field as typed, for when "change" never fired (tapping Done on
 *  iOS can close the sheet without the field losing focus first). */
function wireSteppers(box: HTMLElement, v: Values, redraw: () => void): () => void {
  const set = (k: FieldKey, n: number) => {
    (v as any)[k] = n;
    if (k === 'add' && n > 0) v.rem = 0;
    if (k === 'rem' && n > 0) v.add = 0;
  };
  const bump = (b: HTMLElement, mult = 1) => {
    const k = b.dataset.pk as FieldKey, f = FIELDS.find(x => x.k === k)!;
    const next = clamp(+((v as any)[k] + f.step * mult * +b.dataset.d!).toFixed(1), LIMITS[k] ?? [0, 9999]);
    if (next === (v as any)[k]) return false;
    set(k, next);
    const inp = box.querySelector(`[data-pi="${k}"]`) as HTMLInputElement | null; if (inp) inp.value = String(next);
    return true;
  };
  let hold: { timer: number; n: number } | null = null;
  const stop = () => { if (!hold) return; clearTimeout(hold.timer); hold = null; redraw(); };
  box.addEventListener('pointerdown', e => {
    const b = (e.target as HTMLElement).closest('button[data-pk]') as HTMLElement | null; if (!b || e.button > 0) return;
    e.preventDefault(); stop();
    b.setPointerCapture?.(e.pointerId);
    bump(b); vibrate(8);
    const tick = () => {
      if (!hold) return;
      hold.n++;
      if (!bump(b, hold.n > 30 ? 5 : 1)) { stop(); return; }
      hold.timer = window.setTimeout(tick, Math.max(40, 260 * 0.88 ** hold.n));
    };
    hold = { n: 0, timer: window.setTimeout(tick, 420) };
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) box.addEventListener(ev, stop);
  box.addEventListener('contextmenu', e => { if ((e.target as HTMLElement).closest('button[data-pk]')) e.preventDefault(); });
  box.addEventListener('click', e => { // keyboard (Enter/Space): one step per press
    const b = (e.target as HTMLElement).closest('button[data-pk]') as HTMLElement | null;
    if (b && e.detail === 0 && bump(b)) redraw();
  });
  const read = (i: HTMLInputElement) => {
    const k = i.dataset.pi as FieldKey, f = FIELDS.find(x => x.k === k)!;
    const n = clamp(+String(i.value).replace(',', '.') || 0, LIMITS[k] ?? [0, 9999]);
    const next = f.step < 1 ? Math.round(n * 2) / 2 : Math.round(n);
    if (next !== (v as any)[k]) set(k, next);
  };
  box.addEventListener('change', e => {
    const i = (e.target as HTMLElement).closest('input[data-pi]') as HTMLInputElement | null; if (!i) return;
    read(i); redraw();
  });
  return () => box.querySelectorAll<HTMLInputElement>('input[data-pi]').forEach(read);
}

// ---------- edit one exercise ----------
export type BlockAct = 'save' | 'up' | 'down' | 'dup' | 'remove';
/** Sheet to change an exercise's numbers, hands and grip. With `structure`, it can also move,
 *  duplicate or remove it. Resolves null when cancelled. */
export async function editBlock(b: WorkoutBlock, o: { index: number; count: number; structure: boolean }): Promise<{ act: BlockAct; block: WorkoutBlock } | null> {
  const p = allProtos()[b.proto]; if (!p) return null;
  const v: Values = blockValues(b, p, 0), S = state.settings;
  let grip = b.grip || S.chips.grip || GRIPS[0]![0], fing = b.fing || S.chips.fing || FINGERS[0]!;
  let act: BlockAct | null = null, el!: HTMLElement, readTyped = () => {};
  const chips = (k: string, items: [string, string][], on: string, cls: string) =>
    `<div class="chips g ${cls}" data-bk="${k}">${items.map(([val, label]) => `<span class="chip${val === on ? ' on' : ''}" data-v="${esc(val)}" role="button" tabindex="0" aria-pressed="${val === on}">${label}</span>`).join('')}</div>`;
  const redraw = () => {
    const box = el.querySelector('.be-params') as HTMLElement;
    box.innerHTML = paramsHtml(v); hydrateIcons(box);
    for (const [k, on] of [['mode', v.mode], ['hands', v.hands], ['grip', grip], ['fing', fing]] as const)
      el.querySelectorAll<HTMLElement>(`[data-bk="${k}"] .chip`).forEach(c => { c.classList.toggle('on', c.dataset.v === on); c.setAttribute('aria-pressed', String(c.dataset.v === on)); });
  };
  const i = await sheet({
    title: protoLabel(b.proto, p),
    autofocus: false,
    body: `<div class="bedit">
      <p class="sub">${esc(p.use)}. Intensity: ${esc(p.int)}</p>
      <label class="f">${ic('mode')} Load method</label>${chips('mode', [['hang', 'Hang (on board)'], ['lift', 'No-hang (lift)']], v.mode, 'g2')}
      <div class="params be-params"></div>
      <label class="f">${ic('hands')} Hands</label>${chips('hands', (['both', 'L', 'R', 'LR'] as const).map(h => [h, handsLabel(h)]), v.hands, 'g4')}
      <label class="f">${ic('grip')} Grip</label>${chips('grip', GRIPS.map(([n, k]) => [n, `<em>${ic(k)}</em>${n}`]), grip, 'g6 tile')}
      <label class="f">${ic('fingers')} Fingers</label>${chips('fing', FINGERS.map(f => [f, f]), fing, 'g4')}
      ${o.structure ? `<div class="be-acts">
        <button type="button" class="pill" data-a="up"${o.index === 0 ? ' disabled' : ''}>${ic('up')} Move up</button>
        <button type="button" class="pill" data-a="down"${o.index >= o.count - 1 ? ' disabled' : ''}>${ic('down')} Move down</button>
        <button type="button" class="pill" data-a="dup"${o.count >= MAX_BLOCKS ? ' disabled' : ''}>${ic('copy')} Duplicate</button>
        <button type="button" class="pill danger-text" data-a="remove">${ic('trash')} Remove</button></div>` : ''}
    </div>`,
    buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Done', kind: 'primary' }],
    onMount: e => {
      el = e;
      redraw(); hydrateIcons(el);
      readTyped = wireSteppers(el.querySelector('.be-params')!, v, redraw);
      el.querySelector('.bedit')!.addEventListener('click', ev => {
        const t = ev.target as HTMLElement;
        const a = t.closest('[data-a]') as HTMLButtonElement | null;
        if (a && !a.disabled) { act = a.dataset.a as BlockAct; closeSheet(el); return; }
        const c = t.closest('[data-bk] .chip') as HTMLElement | null; if (!c) return;
        const k = (c.parentElement as HTMLElement).dataset.bk!, val = c.dataset.v!;
        if (k === 'mode') v.mode = val as Values['mode'];
        else if (k === 'hands') v.hands = val as Values['hands'];
        else if (k === 'grip') grip = val;
        else if (k === 'fing') fing = val;
        redraw();
      });
    },
  });
  readTyped();
  const block: WorkoutBlock = { ...b, vals: sanitizeVals(v, b.vals), grip, fing };
  if (act) return { act, block };
  return i === 1 ? { act: 'save', block } : null;
}

// ---------- rest between exercises ----------
/** Change the rest after exercise `i` (or every rest). Resolves true when changed. */
async function editRest(w: Workout, i: number): Promise<boolean> {
  const P = allProtos(), b = w.blocks[i]!, nx = w.blocks[i + 1];
  let t = b.restAfter, el!: HTMLElement;
  const draw = () => {
    (el.querySelector('#restIn') as HTMLInputElement).value = String(t);
    el.querySelector('.rest-fmt')!.textContent = t > 0 ? fmtRest(t) : 'Straight into the next one, after a get-ready countdown';
    el.querySelectorAll<HTMLElement>('.rest-q .chip').forEach(c => c.classList.toggle('on', +c.dataset.s! === t));
  };
  const r = await sheet({
    title: 'Rest between exercises',
    autofocus: false,
    body: `<p class="sub">After <b>${esc(P[b.proto]?.n ?? 'this one')}</b>${nx ? `, before <b>${esc(P[nx.proto]?.n ?? 'the next')}</b>` : ''}.</p>
      <div class="chips g g5 rest-q">${[0, 60, 120, 180, 300].map(s => `<span class="chip" data-s="${s}" role="button" tabindex="0">${s ? fmtRest(s) : 'None'}</span>`).join('')}</div>
      <div class="prm rest-step" style="--c:#7ad7f0"><div class="step"><button type="button" data-d="-15" aria-label="15 seconds less">−</button><input id="restIn" inputmode="numeric" aria-label="Rest in seconds"><small>s</small><button type="button" data-d="15" aria-label="15 seconds more">+</button></div><small class="rest-fmt"></small></div>
      ${w.blocks.length > 2 ? '<label class="chk"><input type="checkbox" id="restAll"> Use this for every rest in the workout</label>' : ''}`,
    buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Done', kind: 'primary' }],
    onMount: e => {
      el = e; draw();
      el.addEventListener('click', ev => {
        const x = ev.target as HTMLElement;
        const q = x.closest('.rest-q .chip') as HTMLElement | null;
        if (q) { t = +q.dataset.s!; draw(); return; }
        const d = x.closest('.rest-step button[data-d]') as HTMLElement | null;
        if (d) { t = clamp(t + +d.dataset.d!, REST_LIMITS); draw(); vibrate(8); }
      });
      el.querySelector('#restIn')!.addEventListener('change', ev => { t = clamp(Math.round(+(ev.target as HTMLInputElement).value || 0), REST_LIMITS); draw(); });
    },
  });
  if (r !== 1) return false;
  t = clamp(Math.round(+(el.querySelector('#restIn') as HTMLInputElement).value || 0), REST_LIMITS);
  if ((el.querySelector('#restAll') as HTMLInputElement | null)?.checked) w.blocks.forEach(x => { x.restAfter = t; });
  else b.restAfter = t;
  return true;
}

// ---------- the exercise list ----------
export interface QueueOpts {
  /** Reorder (drag, move up/down), duplicate and remove. Without it, only numbers and rests can change. */
  structure: boolean;
  onChange: () => void;
}
export function drawQueue(el: HTMLElement, w: Workout, o: QueueOpts) {
  const P = allProtos(), n = w.blocks.length;
  el.classList.add('wq-list');
  el.innerHTML = n ? w.blocks.map((b, i) => {
    const p = P[b.proto];
    return `<div class="wq${p ? '' : ' gone'}" data-i="${i}">
      <div class="wq-row"><button type="button" class="wq-main" data-edit><span class="wq-n">${i + 1}</span><span class="nm"><b>${p ? protoLabel(b.proto, p) : 'Deleted protocol'}</b><small>${esc(p ? blockLine(b.vals, b.grip) : 'Its protocol was deleted, so it’ll be skipped')}</small>${b.adj ? `<small class="wq-adj">${ic('chart')} ${esc(b.adj)}</small>` : ''}</span>${o.structure ? '' : `<span class="wq-ed" aria-hidden="true">${ic('edit')}</span>`}</button>
      ${o.structure ? `<button type="button" class="wq-h" data-drag aria-label="Drag to reorder ${esc(p?.n ?? 'exercise')}">${ic('handle')}</button>` : ''}</div>
      ${i < n - 1 ? `<button type="button" class="wq-rest" data-rest>${ic('rest')} ${b.restAfter > 0 ? `Rest ${fmtRest(b.restAfter)}` : 'No rest'}</button>` : ''}
    </div>`;
  }).join('') : '<p class="sub wq-empty">No exercises yet. Add one below.</p>';
  hydrateIcons(el);

  el.onclick = async e => {
    const t = e.target as HTMLElement, row = t.closest('.wq') as HTMLElement | null; if (!row) return;
    const i = +row.dataset.i!, b = w.blocks[i]; if (!b) return;
    if (t.closest('[data-rest]')) { if (await editRest(w, i)) o.onChange(); return; }
    if (!t.closest('[data-edit]')) return;
    if (!P[b.proto]) {
      if (!o.structure) return toast('Edit the workout to remove it');
      w.blocks.splice(i, 1); o.onChange(); return;
    }
    const r = await editBlock(b, { index: i, count: w.blocks.length, structure: o.structure }); if (!r) return;
    if (r.act === 'remove') { w.blocks.splice(i, 1); toast(`Removed ${P[b.proto]!.n}`); }
    else {
      w.blocks[i] = r.block;
      if (r.act === 'up') w.blocks = moveItem(w.blocks, i, i - 1);
      if (r.act === 'down') w.blocks = moveItem(w.blocks, i, i + 1);
      if (r.act === 'dup') w.blocks.splice(i + 1, 0, { ...JSON.parse(JSON.stringify(r.block)), id: newId('b') });
    }
    o.onChange();
  };

  // Drag the handle to reorder: the row follows the finger and the others slide out of the way.
  el.onpointerdown = !o.structure ? null : e => {
    const h = (e.target as HTMLElement).closest('[data-drag]') as HTMLElement | null; if (!h || e.button > 0) return;
    const items = [...el.querySelectorAll<HTMLElement>('.wq')], item = h.closest('.wq') as HTMLElement, from = items.indexOf(item);
    if (items.length < 2 || from < 0) return;
    e.preventDefault();
    h.setPointerCapture?.(e.pointerId);
    const rects = items.map(x => x.getBoundingClientRect()), y0 = e.clientY, hgt = rects[from]!.height;
    let to = from;
    item.classList.add('drag'); vibrate(10);
    const move = (ev: PointerEvent) => {
      const top = rects[0]!.top - rects[from]!.top, bottom = rects.at(-1)!.bottom - rects[from]!.bottom;
      const dy = Math.max(top - 20, Math.min(bottom + 20, ev.clientY - y0));
      item.style.transform = `translateY(${dy}px)`;
      const mid = rects[from]!.top + hgt / 2 + dy;
      const next = rects.filter((r, j) => j !== from && r.top + r.height / 2 < mid).length;
      if (next !== to) { to = next; vibrate(5); }
      items.forEach((x, j) => {
        if (j === from) return;
        const shift = from < j && j <= to ? -hgt : to <= j && j < from ? hgt : 0;
        x.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    };
    let ended = false;
    const end = () => {
      if (ended) return; ended = true; // pointerup is followed by lostpointercapture
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) h.removeEventListener(ev, end);
      h.removeEventListener('pointermove', move);
      items.forEach(x => { x.style.transform = ''; }); item.classList.remove('drag');
      if (to !== from) { w.blocks = moveItem(w.blocks, from, to); o.onChange(); }
    };
    h.addEventListener('pointermove', move);
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) h.addEventListener(ev, end);
  };
}
