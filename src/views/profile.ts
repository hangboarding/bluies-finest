import { $, $$, esc, toast, sheet, confirmSheet, promptSheet, bubble, avatar } from '../lib/ui';
import { ic, hydrateIcons } from '../lib/icons';
import { state, saveSettings, flushSettings, mySessions } from '../lib/state';
import { TIPS } from '../lib/protocols';
import { applyTheme, ACCENTS, refreshHeader, rerender } from '../main';
import { bumpDaily } from '../lib/achievements';
import { setSound } from '../lib/timer';
import { resetTours } from './tour';
import { addBoard, drawBoards, hangBusy, hangPending, getReady, preHang, drawLoadHint } from './hang';
import { openAdmin } from './admin';
import { openReport } from './report';
import { pushSupport, pushEnabled, enablePush, disablePush } from '../lib/push';
import { checkUnlocks } from './unlocks';

export function renderProfile(root: HTMLElement) {
  const S = state.settings, P = S.prefs, me = state.me!;
  const toggle = (k: keyof typeof P, label: string, sub: string, icon: string) =>
    `<div class="tg"><span>${ic(icon)} ${label}<small>${sub}</small></span><button class="sw2 ${P[k] ? 'on' : ''}" data-set="${k}" role="switch" aria-checked="${!!P[k]}" aria-label="${label}"></button></div>`;
  root.innerHTML = `
  <div class="card center">
    <label class="upl" id="upl" aria-label="Change photo">${avatar(me, 'uplpic')}<span class="camb">${ic('camera')}</span><input type="file" accept="image/jpeg,image/png,image/webp" class="vh" id="file" aria-label="Change photo"></label>
    <label class="f left">Name</label>
    <div class="fld"><input class="tx" id="pName" maxlength="40" placeholder="Name" value="${esc(me.name)}" aria-label="Name"></div>
    <div class="about">
      <div><label class="f lab">Bodyweight<span class="tip" data-tip="bodyweight">i</span></label>
        <div class="prm" style="--c:#b48cff"><div class="step"><button data-bw="-0.5" aria-label="Decrease bodyweight">−</button><input id="bw" inputmode="decimal" value="${state.priv.bodyweightKg ?? ''}" placeholder="Not set" aria-label="Bodyweight in kg"><small>kg</small><button data-bw="0.5" aria-label="Increase bodyweight">+</button></div></div></div>
      <div class="split">
        <div><label class="f">Age <small>(optional)</small></label><input class="tx" id="pAge" type="number" inputmode="numeric" min="10" max="100" value="${S.about?.age ?? ''}" placeholder="Not set" aria-label="Age"></div>
        <div><label class="f">Height <small>(cm, optional)</small></label><input class="tx" id="pHeight" type="number" inputmode="numeric" min="100" max="230" value="${S.about?.heightCm ?? ''}" placeholder="Not set" aria-label="Height in centimetres"></div>
      </div>
      <div><label class="f">Location <small>(optional)</small></label><input class="tx" id="pLoc" maxlength="60" value="${esc(S.about?.location ?? '')}" placeholder="e.g. Katoomba" aria-label="Location">
        <label class="showloc"><input type="checkbox" id="pLocShow" ${S.about?.showLocation ? 'checked' : ''}> Show my location on my profile</label></div>
      <p class="sub" style="margin:0">${ic('lock')} Age and height are private, and so is your location unless you tick the box above. Your bodyweight is never shown. Others only see a rounded % on your sessions.</p>
    </div>
    <p class="savestat" id="saveStat" aria-live="polite">Changes save automatically</p>
    ${state.store.kind === 'local' ? '<p class="sub" style="margin-top:10px">Demo mode: data is stored in this browser only.</p>' : ''}
  </div>
  <div class="card boards"><h3>${ic('board')} My hangboards</h3><p class="sub">${ic('star')} = default for new sessions</p>
    <div id="boardList"></div>
    <div class="addrow"><input class="tx" id="newBoard" maxlength="60" placeholder="e.g. Garage board" aria-label="New board name"><button id="addBoard" aria-label="Add board">+</button></div></div>
  <div class="card"><h3>${ic('theme')} Theme</h3>
    <label class="f">Mode</label><div class="seg" id="mode"><button data-m="dark" class="${P.mode === 'dark' ? 'on' : ''}">Dark</button><button data-m="light" class="${P.mode === 'light' ? 'on' : ''}">Light</button></div><br>
    <label class="f">Icons</label><div class="seg" id="icons"><button data-i="emoji" class="${P.icons === 'emoji' ? 'on' : ''}">😀 Emoji</button><button data-i="flat" class="${P.icons === 'flat' ? 'on' : ''}">${ic('mountain', 'flat')} Flat</button></div><br>
    <label class="f">Accent colour</label><div class="sw" id="sw">${ACCENTS.map(c => `<i data-c="${c}" style="background:${c}" class="${c === P.acc ? 'on' : ''}" role="button" tabindex="0" aria-label="Accent ${c}"></i>`).join('')}<label class="sw-custom ${ACCENTS.includes(P.acc) ? '' : 'on'}" style="${ACCENTS.includes(P.acc) ? '' : `--mine:${P.acc}`}" aria-label="Pick your own colour" title="Pick your own colour"><input type="color" id="accPick" value="${P.acc}"></label></div></div>
  <div class="card"><h3>${ic('settings')} Settings</h3>
    ${toggle('sound', 'Sounds', 'Countdown beeps and the finish chime', 'sound')}
    ${toggle('vib', 'Vibration', 'Buzz on phase changes (phones only)', 'vib')}
    <div class="tg"><span>${ic('ready')} Get-ready countdown<small>Before the first hang, to chalk up and get set. 0 skips it.</small></span><span class="numset"><input class="tx" id="setReady" type="number" inputmode="numeric" min="0" max="60" value="${getReady()}" aria-label="Get-ready countdown in seconds"><small>s</small></span></div>
    <div class="tg"><span>${ic('rest')} Pre-hang countdown<small>Beeps for the last few seconds of each rest. Always ends before the rest does.</small></span><span class="numset"><input class="tx" id="setPre" type="number" inputmode="numeric" min="0" max="30" value="${preHang()}" aria-label="Pre-hang countdown in seconds"><small>s</small></span></div>
    ${toggle('warmup', 'Warm-up reminder', 'Suggest a warm-up before max-effort sessions', 'sprout')}
    ${toggle('nudges', 'Overtraining warnings', 'Warn about back-to-back hard days or too many max sessions in a week', 'help')}
    <div class="tg hide" id="pushRow"><span>${ic('bell')} Phone notifications<small id="pushSub">When someone hearts or comments on your sessions, or takes your place in the top 3</small></span><button class="sw2" id="pushTg" role="switch" aria-checked="false" aria-label="Phone notifications"></button></div>
    ${toggle('pgrip', 'Show Grip section', 'Grip type, fingers and hands on the Hang screen', 'grip')}
    ${toggle('psetup', 'Show Setup section', 'Board, edge material and profile on the Hang screen', 'board')}
    <div class="tg"><span>${ic('help')} App tour<small>Show the intro and page tips again</small></span><button class="pill" id="replay">Replay</button></div></div>
  <div class="card"><h3>${ic('download')} Your data</h3><p class="sub">Download every session, setting and board as a JSON file.</p>
    <button class="big ghost" id="dl">${ic('download')} Download my data</button></div>
  ${me.isAdmin ? `<button class="big ghost" id="adminBtn" style="margin-bottom:10px">${ic('admin')} Admin tools</button>` : ''}
  <button class="big ghost" id="reportBtn" style="margin-bottom:10px">${ic('bug')} Report an issue</button>
  <button class="big ghost" id="chgPw" style="margin-bottom:10px">${ic('lock')} Change password</button>
  <button class="big ghost" id="logout">${ic('logout')} Log out</button>
  <button class="big ghost danger-text" id="delAcc" style="margin-top:10px">${ic('trash')} Delete account</button>`;
  drawBoardList(); hydrateIcons(root); drawPush();
  root.onclick = onClick;
  // countdown settings: saved when the box loses focus or Enter is pressed
  const numPref = (id: string, key: 'ready' | 'pre', max: number, label: string) => {
    const i = $(`#${id}`) as HTMLInputElement;
    i.addEventListener('change', () => {
      const n = Math.round(+i.value);
      if (!Number.isFinite(n) || n < 0 || n > max) { i.value = String(key === 'ready' ? getReady() : preHang()); return toast(`${label} can be 0–${max} seconds`); }
      S.prefs[key] = n; i.value = String(n); saveSettings(); toast(`${label}: ${n ? n + 's' : 'off'}`);
    });
  };
  numPref('setReady', 'ready', 60, 'Get-ready countdown');
  numPref('setPre', 'pre', 30, 'Pre-hang countdown');
  $('#file').addEventListener('change', onPhoto);
  // About you: saves itself. While typing, about a second after you stop (and only if the value
  // makes sense); when you leave a field, straight away (with a message if it doesn't).
  for (const id of ['pName', 'bw', 'pAge', 'pHeight', 'pLoc']) {
    const i = $(`#${id}`) as HTMLInputElement;
    i.addEventListener('input', () => scheduleAbout(1100));
    i.addEventListener('change', () => saveAboutNow(true));
  }
  $('#pLocShow').addEventListener('change', () => saveAboutNow(true));
  // custom colour: live preview while dragging, saved when the picker closes
  const pick = $('#accPick') as HTMLInputElement;
  pick.addEventListener('input', () => { S.prefs.acc = pick.value; applyTheme(); markCustom(true, pick.value); });
  pick.addEventListener('change', () => setAccent(pick.value));
  $('#newBoard').addEventListener('keydown', e => { if (e.key === 'Enter') $('#addBoard').click(); });
}

function drawBoardList() {
  const B = state.settings.boards;
  $('#boardList').innerHTML = B.list.length ? B.list.map(b => `<div class="lrow"><button class="star ${b === B.def ? 'on' : ''}" data-b="${esc(b)}" aria-label="Make ${esc(b)} default">${ic('star')}</button><span class="nm">${esc(b)}</span><button class="ed" data-renb="${esc(b)}" aria-label="Rename ${esc(b)}">${ic('edit')}</button><button class="ed" data-delb="${esc(b)}" aria-label="Remove ${esc(b)}">${ic('trash')}</button></div>`).join('') : '<p class="sub">No boards yet. Add one below.</p>';
  hydrateIcons($('#boardList'));
}

/** Rename one of my boards everywhere it's picked. Sessions already logged keep the name they were saved with. */
async function renameBoard(b: string) {
  const n = (await promptSheet('Rename board', 'Sessions you’ve already logged on it keep the old name.', 'e.g. Garage board', 'Save', b))?.trim().slice(0, 60);
  if (!n || n === b) return;
  const S = state.settings, B = S.boards;
  if (B.list.includes(n)) { toast(`You already have a board called ${n}`); return; }
  const swap = (x: string) => (x === b ? n : x);
  B.list = B.list.map(swap);
  B.custom = B.custom.includes(b) ? B.custom.map(swap) : [...B.custom, n]; // a renamed built-in board is your own now
  B.def = swap(B.def); if (S.board) S.board = swap(S.board);
  saveSettings(); drawBoardList(); drawBoards(); toast(`Renamed to ${n}`); checkUnlocks();
}

function markCustom(on: boolean, colour?: string) {
  const c = $('.sw-custom'); c.classList.toggle('on', on); c.style.setProperty('--mine', on && colour ? colour : '');
  if (on) $$('#sw i').forEach(x => x.classList.remove('on'));
}
function setAccent(colour: string) {
  if (!/^#[0-9a-f]{6}$/i.test(colour)) return;
  const S = state.settings;
  S.prefs.acc = colour; if (bumpDaily(S.flags, 'accent') >= 10) { S.flags.spinCycle = true; checkUnlocks(); }
  applyTheme(); saveSettings();
  $$('#sw i').forEach(x => x.classList.toggle('on', x.dataset.c === colour));
  markCustom(!ACCENTS.includes(colour), colour);
}

/** Phone notifications row: hidden until push is configured; explains iPhone's install requirement. */
async function drawPush() {
  const row = $('#pushRow'), sub = $('#pushSub'), tg = $('#pushTg') as HTMLButtonElement; if (!row) return;
  const sup = pushSupport();
  if (sup === 'demo') return; // not set up on the server yet
  row.classList.remove('hide');
  if (sup === 'ios-install') { tg.classList.add('hide'); sub.textContent = 'On iPhone, first add this app to your Home Screen (Share → Add to Home Screen), then open it from there.'; return; }
  if (sup === 'unsupported') { tg.classList.add('hide'); sub.textContent = 'This browser can’t receive notifications. Try Chrome, or the installed app.'; return; }
  const on = await pushEnabled();
  tg.classList.toggle('on', on); tg.setAttribute('aria-checked', String(on));
}
async function togglePush() {
  const tg = $('#pushTg') as HTMLButtonElement, on = tg.classList.contains('on');
  tg.disabled = true;
  try {
    // called straight from the tap so iOS allows the permission prompt
    if (on) { await disablePush(); toast('Phone notifications off'); } else { await enablePush(); toast('Phone notifications on 🔔'); }
  } catch (e: any) { toast(e.message ?? 'Couldn’t change notifications', 5000); }
  finally { tg.disabled = false; await drawPush(); }
}

/** Password fields only exist inside this popup, so browsers don't keep offering to save
 *  or fill a password every time someone edits their profile. */
async function changePassword() {
  for (;;) {
    let el!: HTMLElement;
    const i = await sheet({
      title: 'Change password',
      body: `<form onsubmit="return false" style="text-align:left">
        <input class="tx" type="password" id="pw1" autocomplete="new-password" placeholder="New password (min 8 characters)" aria-label="New password" style="margin-bottom:10px">
        <input class="tx" type="password" id="pw2" autocomplete="new-password" placeholder="Repeat new password" aria-label="Repeat new password" style="margin-bottom:12px"></form>`,
      buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Change', kind: 'primary' }],
      onMount: e => { el = e; },
    });
    if (i !== 1) return;
    const a = (el.querySelector('#pw1') as HTMLInputElement).value, b = (el.querySelector('#pw2') as HTMLInputElement).value;
    if (a.length < 8) { toast('Password must be at least 8 characters'); continue; }
    if (a !== b) { toast('Passwords don’t match'); continue; }
    try { await state.store.updatePassword(a); toast('Password changed'); } catch (err: any) { toast(err.message ?? 'Couldn’t change password'); }
    return;
  }
}

/** Parse an optional number field; returns undefined when invalid, null when empty. */
function num(id: string, min: number, max: number): number | null | undefined {
  const raw = ($(`#${id}`) as HTMLInputElement).value.trim();
  if (raw === '') return null;
  const n = +raw.replace(',', '.');
  return isFinite(n) && n >= min && n <= max ? Math.round(n * 10) / 10 : undefined;
}

// ---------- About you: auto-save ----------
let aboutTimer: number | undefined, saving: Promise<void> | null = null, again = false;
function status(text: string, kind: '' | 'ok' | 'err' = '') {
  const el = $('#saveStat'); if (!el) return;
  el.textContent = text; el.className = `savestat ${kind}`;
}
function scheduleAbout(ms: number) { clearTimeout(aboutTimer); aboutTimer = window.setTimeout(() => saveAboutNow(false), ms); }
/** Save now if anything is waiting (used before the page re-renders or the app is hidden). */
export function flushAbout() { if (aboutTimer !== undefined) { clearTimeout(aboutTimer); aboutTimer = undefined; return saveAboutNow(false); } }
addEventListener('pagehide', () => { flushAbout(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAbout(); });

/** Save if the values are valid. `loud`: say what's wrong (on leaving a field); otherwise wait quietly. */
async function saveAboutNow(loud: boolean): Promise<void> {
  clearTimeout(aboutTimer); aboutTimer = undefined;
  if (!$('#pName')) return;
  if (saving) { again = true; return saving; } // one save at a time; run once more afterwards
  saving = saveAbout(loud).finally(() => { saving = null; if (again) { again = false; saveAboutNow(loud); } });
  return saving;
}

/** Save name, bodyweight and the optional private details in one go. */
async function saveAbout(loud: boolean) {
  const name = ($('#pName') as HTMLInputElement).value.trim();
  const bw = num('bw', 20, 250), age = num('pAge', 10, 100), heightCm = num('pHeight', 100, 230);
  const problem = !name ? 'Name can’t be empty' : bw === undefined ? 'Bodyweight should be between 20 and 250 kg'
    : age === undefined ? 'Age should be between 10 and 100' : heightCm === undefined ? 'Height should be between 100 and 230 cm' : '';
  if (problem || bw === undefined || age === undefined || heightCm === undefined) { if (loud) status(`${problem}. Not saved yet.`, 'err'); return; }
  const location = ($('#pLoc') as HTMLInputElement).value.trim().slice(0, 60);
  const showLocation = ($('#pLocShow') as HTMLInputElement).checked;
  const A = state.settings.about, mine = state.profiles.get(state.me!.id), shown = showLocation && location ? location : null;
  const changed = name !== state.me!.name || bw !== (state.priv.bodyweightKg ?? null) || (mine?.location ?? null) !== shown
    || age !== (A?.age ?? null) || heightCm !== (A?.heightCm ?? null) || location !== (A?.location ?? '') || showLocation !== !!A?.showLocation;
  if (!changed) { if ($('#saveStat')?.classList.contains('err')) status('✓ Saved', 'ok'); return; }
  status('Saving…');
  try {
    if (name !== state.me!.name) {
      await state.store.updateProfile({ name });
      state.me!.name = name; state.profiles.get(state.me!.id)!.name = name; refreshHeader();
    }
    // the public copy of the location only exists while "show" is ticked
    if ((mine?.location ?? null) !== shown) { await state.store.updateProfile({ location: shown }); if (mine) mine.location = shown; }
    state.settings.about = { age, heightCm, location, showLocation };
    state.settings.savedAt = Date.now();
    state.priv.bodyweightKg = bw;
    // bodyweight + private details go up together in one private write
    await state.store.savePrivate({ bodyweightKg: bw, settings: state.settings as any });
    saveSettings();
    drawLoadHint(); // the Hang screen's "% of bodyweight" line
    status('✓ Saved', 'ok');
  } catch (e: any) { status(`${e.message ?? 'Could not save'}. Try again.`, 'err'); }
}

async function onPhoto(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
  try {
    const blob = await shrink(f, 512);
    const url = await state.store.uploadAvatar(blob);
    state.me!.avatarUrl = url; state.profiles.get(state.me!.id)!.avatarUrl = url;
    $('#upl .uplpic').outerHTML = avatar(state.me!, 'uplpic'); refreshHeader(); toast('Photo updated'); checkUnlocks();
  } catch (err: any) { toast(err.message ?? 'Upload failed'); }
  finally { (e.target as HTMLInputElement).value = ''; } // so picking the same photo again still works
}
/** Resize to a square JPEG so uploads stay small. */
async function shrink(file: File, size: number): Promise<Blob> {
  const img = await createImageBitmap(file); const s = Math.min(img.width, img.height);
  const c = document.createElement('canvas'); c.width = c.height = size;
  c.getContext('2d')!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('Could not read that image'))), 'image/jpeg', 0.85));
}

async function onClick(e: MouseEvent) {
  const t = e.target as HTMLElement, S = state.settings;
  const tip = t.closest('.tip') as HTMLElement | null; if (tip) { const [h, b] = TIPS[tip.dataset.tip!]!; bubble(h, b); return; }
  const bwb = t.closest('[data-bw]') as HTMLElement | null;
  if (bwb) { const i = $('#bw') as HTMLInputElement; i.value = String(Math.max(20, (+i.value || 70) + +bwb.dataset.bw!)); scheduleAbout(900); return; }
  const tg = t.closest('[data-set]') as HTMLElement | null;
  if (tg) { const k = tg.dataset.set as 'sound'; (S.prefs as any)[k] = !S.prefs[k]; tg.classList.toggle('on', !!S.prefs[k]); tg.setAttribute('aria-checked', String(!!S.prefs[k])); setSound(S.prefs.sound); (window as any).__prefs = S.prefs; saveSettings(); return; }
  const m = t.closest('#mode [data-m]') as HTMLElement | null;
  if (m) { S.prefs.mode = m.dataset.m as any; applyTheme(); $$('#mode button').forEach(b => b.classList.toggle('on', b === m)); saveSettings(); return; }
  const ii = t.closest('#icons [data-i]') as HTMLElement | null;
  if (ii && (hangBusy() || hangPending())) { toast('Save or finish your session first'); return; }
  if (ii) { S.prefs.icons = ii.dataset.i as any; saveSettings(); applyTheme(); await flushAbout(); await rerender(); toast(S.prefs.icons === 'flat' ? 'Flat icons on' : 'Emoji icons on'); return; }
  const sw = t.closest('#sw [data-c]') as HTMLElement | null;
  if (sw) { setAccent(sw.dataset.c!); return; }
  const star = t.closest('[data-b]') as HTMLElement | null;
  if (star) { S.boards.def = star.dataset.b!; S.board = S.boards.def; saveSettings(); drawBoardList(); return; }
  const renb = t.closest('[data-renb]') as HTMLElement | null;
  if (renb) { await renameBoard(renb.dataset.renb!); return; }
  const delb = t.closest('[data-delb]') as HTMLElement | null;
  if (delb) { const b = delb.dataset.delb!; S.boards.list = S.boards.list.filter(x => x !== b); if (S.boards.def === b) S.boards.def = S.boards.list[0] ?? ''; if (S.board === b) S.board = S.boards.def; saveSettings(); drawBoardList(); return; }
  if (t.closest('#addBoard')) { const i = $('#newBoard') as HTMLInputElement; if (i.value.trim()) { await addBoard(i.value); i.value = ''; drawBoardList(); } return; }
  if (t.closest('#chgPw')) { await changePassword(); return; }
  if (t.closest('#adminBtn')) { openAdmin(); return; }
  if (t.closest('#reportBtn')) { await openReport(); return; }
  if (t.closest('#replay')) { resetTours(); await flushSettings(); location.hash = ''; location.reload(); return; }
  if (t.closest('#dl')) {
    const data = { exported: new Date().toISOString(), app: 'Bluies Finest', profile: { name: state.me?.name }, bodyweightKg: state.priv.bodyweightKg, settings: S, sessions: mySessions() };
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = `bluies-finest-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); toast('Data downloaded'); return;
  }
  if (t.closest('#logout')) { await disablePush().catch(() => {}); await state.store.signOut(); return; }
  if (t.closest('#pushTg')) { await togglePush(); return; }
  if (t.closest('#delAcc')) {
    if (!await confirmSheet('Delete your account?', 'This permanently deletes your profile, photo, every session, heart and comment. It can’t be undone. Consider downloading your data first.', 'Continue')) return;
    const typed = await promptSheet('Are you sure?', 'Type <b>DELETE</b> to confirm.', 'DELETE', 'Delete forever');
    if (typed !== 'DELETE') return toast('Account not deleted');
    try { await state.store.deleteAccount(); try { localStorage.removeItem('bf.settings'); } catch { /* ignore */ } toast('Account deleted'); } catch (err: any) { toast(err.message); }
  }
}
