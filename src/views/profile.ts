import { $, $$, esc, toast, confirmSheet, promptSheet, bubble, avatar } from '../lib/ui';
import { ic, hydrateIcons } from '../lib/icons';
import { state, saveSettings, flushSettings, mySessions } from '../lib/state';
import { TIPS } from '../lib/protocols';
import { applyTheme, ACCENTS, refreshHeader, rerender } from '../main';
import { bumpDaily } from '../lib/achievements';
import { setSound } from '../lib/timer';
import { resetTours } from './tour';
import { addBoard } from './hang';

export function renderProfile(root: HTMLElement) {
  const S = state.settings, P = S.prefs, me = state.me!;
  const toggle = (k: keyof typeof P, label: string, sub: string, icon: string) =>
    `<div class="tg"><span>${ic(icon)} ${label}<small>${sub}</small></span><button class="sw2 ${P[k] ? 'on' : ''}" data-set="${k}" role="switch" aria-checked="${!!P[k]}" aria-label="${label}"></button></div>`;
  root.innerHTML = `
  <div class="card center">
    <label class="upl" id="upl" aria-label="Change photo">${avatar(me, 'uplpic')}<input type="file" accept="image/jpeg,image/png,image/webp" hidden id="file"></label>
    <div class="fld"><input class="tx" id="pName" maxlength="40" placeholder="Climber name" value="${esc(me.name)}" aria-label="Name"></div>
    <button class="big" id="saveName">Save name</button>
    ${state.store.kind === 'local' ? '<p class="sub" style="margin-top:10px">Demo mode — data is stored in this browser only.</p>' : ''}
  </div>
  <div class="card"><h3 class="lab">${ic('muscle')} Bodyweight<span class="tip" data-tip="bodyweight">i</span></h3>
    <div class="prm" style="--c:#b48cff"><div class="step"><button data-bw="-0.5" aria-label="Decrease bodyweight">−</button><input id="bw" inputmode="decimal" value="${state.priv.bodyweightKg ?? ''}" placeholder="—" aria-label="Bodyweight in kg"><small>kg</small><button data-bw="0.5" aria-label="Increase bodyweight">+</button></div></div>
    <p class="sub" style="margin:8px 0 0">${ic('lock')} Private — only you can ever see this.</p></div>
  <div class="card"><h3>${ic('lock')} Password</h3>
    <div class="fld"><input class="tx" type="password" id="pw1" autocomplete="new-password" placeholder="New password (min 6 characters)" aria-label="New password"></div>
    <div class="fld"><input class="tx" type="password" id="pw2" autocomplete="new-password" placeholder="Repeat new password" aria-label="Repeat new password"></div>
    <button class="big ghost" id="savePw">Change password</button></div>
  <div class="card boards"><h3>${ic('board')} My hangboards</h3><p class="sub">${ic('star')} = default for new sessions</p>
    <div id="boardList"></div>
    <div class="addrow"><input class="tx" id="newBoard" placeholder="e.g. Garage board" aria-label="New board name"><button id="addBoard" aria-label="Add board">+</button></div></div>
  <div class="card"><h3>${ic('theme')} Theme</h3>
    <label class="f">Mode</label><div class="seg" id="mode"><button data-m="dark" class="${P.mode === 'dark' ? 'on' : ''}">Dark</button><button data-m="light" class="${P.mode === 'light' ? 'on' : ''}">Light</button></div><br>
    <label class="f">Icons</label><div class="seg" id="icons"><button data-i="emoji" class="${P.icons === 'emoji' ? 'on' : ''}">😀 Emoji</button><button data-i="flat" class="${P.icons === 'flat' ? 'on' : ''}">${ic('mountain', 'flat')} Flat</button></div><br>
    <label class="f">Accent colour</label><div class="sw" id="sw">${ACCENTS.map(c => `<i data-c="${c}" style="background:${c}" class="${c === P.acc ? 'on' : ''}" role="button" aria-label="Accent ${c}"></i>`).join('')}</div></div>
  <div class="card"><h3>${ic('settings')} Settings</h3>
    ${toggle('sound', 'Sounds', 'Countdown beeps and the finish chime', 'sound')}
    ${toggle('vib', 'Vibration', 'Buzz on phase changes (phones only)', 'vib')}
    ${toggle('pgrip', 'Show Grip section', 'Grip type, fingers and hands on the Hang screen', 'grip')}
    ${toggle('psetup', 'Show Setup section', 'Board, edge material and profile on the Hang screen', 'board')}
    <div class="tg"><span>${ic('help')} App tour<small>Show the intro and page tips again</small></span><button class="pill" id="replay">Replay</button></div></div>
  <div class="card"><h3>${ic('download')} Your data</h3><p class="sub">Download every session, setting and board as a JSON file.</p>
    <button class="big ghost" id="dl">${ic('download')} Download my data</button></div>
  <button class="big ghost" id="logout">${ic('logout')} Log out</button>
  <button class="big ghost danger-text" id="delAcc" style="margin-top:10px">${ic('trash')} Delete account</button>`;
  drawBoardList(); hydrateIcons(root);
  root.onclick = onClick;
  $('#file').addEventListener('change', onPhoto);
  $('#bw').addEventListener('change', () => saveBw(($('#bw') as HTMLInputElement).value));
  $('#newBoard').addEventListener('keydown', e => { if (e.key === 'Enter') $('#addBoard').click(); });
}

function drawBoardList() {
  const B = state.settings.boards;
  $('#boardList').innerHTML = B.list.length ? B.list.map(b => `<div class="lrow"><button class="star ${b === B.def ? 'on' : ''}" data-b="${esc(b)}" aria-label="Make ${esc(b)} default">${ic('star', 'emoji')}</button><span class="nm">${esc(b)}</span><button class="ed" data-delb="${esc(b)}" aria-label="Remove ${esc(b)}">${ic('trash')}</button></div>`).join('') : '<p class="sub">No boards yet — add one below.</p>';
  hydrateIcons($('#boardList'));
}

async function saveBw(v: string) {
  const n = v.trim() === '' ? null : Math.max(20, Math.min(250, +v));
  if (n != null && isNaN(n)) return toast('Enter a number in kg');
  state.priv.bodyweightKg = n; ($('#bw') as HTMLInputElement).value = n == null ? '' : String(n);
  try { await state.store.savePrivate({ bodyweightKg: n }); toast('Bodyweight saved (private)'); } catch (e: any) { toast(e.message); }
}

async function onPhoto(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
  try {
    const blob = await shrink(f, 512);
    const url = await state.store.uploadAvatar(blob);
    state.me!.avatarUrl = url; state.profiles.get(state.me!.id)!.avatarUrl = url;
    $('#upl .uplpic').outerHTML = avatar(state.me!, 'uplpic'); refreshHeader(); toast('Photo updated');
  } catch (err: any) { toast(err.message ?? 'Upload failed'); }
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
  if (bwb) { const i = $('#bw') as HTMLInputElement; i.value = String(Math.max(20, (+i.value || 70) + +bwb.dataset.bw!)); clearTimeout((i as any)._t); (i as any)._t = setTimeout(() => saveBw(i.value), 600); return; }
  const tg = t.closest('[data-set]') as HTMLElement | null;
  if (tg) { const k = tg.dataset.set as 'sound'; (S.prefs as any)[k] = !S.prefs[k]; tg.classList.toggle('on', !!S.prefs[k]); tg.setAttribute('aria-checked', String(!!S.prefs[k])); setSound(S.prefs.sound); (window as any).__prefs = S.prefs; saveSettings(); return; }
  const m = t.closest('#mode [data-m]') as HTMLElement | null;
  if (m) { S.prefs.mode = m.dataset.m as any; applyTheme(); $$('#mode button').forEach(b => b.classList.toggle('on', b === m)); saveSettings(); return; }
  const ii = t.closest('#icons [data-i]') as HTMLElement | null;
  if (ii) { S.prefs.icons = ii.dataset.i as any; saveSettings(); applyTheme(); await rerender(); toast(S.prefs.icons === 'flat' ? 'Flat icons on' : 'Emoji icons on'); return; }
  const sw = t.closest('#sw [data-c]') as HTMLElement | null;
  if (sw) { S.prefs.acc = sw.dataset.c!; if (bumpDaily(S.flags, 'accent') >= 10) S.flags.spinCycle = true; applyTheme(); $$('#sw i').forEach(x => x.classList.toggle('on', x === sw)); saveSettings(); return; }
  const star = t.closest('[data-b]') as HTMLElement | null;
  if (star) { S.boards.def = star.dataset.b!; S.board = S.boards.def; saveSettings(); drawBoardList(); return; }
  const delb = t.closest('[data-delb]') as HTMLElement | null;
  if (delb) { const b = delb.dataset.delb!; S.boards.list = S.boards.list.filter(x => x !== b); if (S.boards.def === b) S.boards.def = S.boards.list[0] ?? ''; if (S.board === b) S.board = S.boards.def; saveSettings(); drawBoardList(); return; }
  if (t.closest('#addBoard')) { const i = $('#newBoard') as HTMLInputElement; if (i.value.trim()) { await addBoard(i.value); i.value = ''; drawBoardList(); } return; }
  if (t.closest('#saveName')) { const n = ($('#pName') as HTMLInputElement).value.trim(); if (!n) return toast('Name can’t be empty'); try { await state.store.updateProfile({ name: n }); state.me!.name = n; state.profiles.get(state.me!.id)!.name = n; refreshHeader(); toast('Name saved'); } catch (err: any) { toast(err.message); } return; }
  if (t.closest('#savePw')) {
    const a = ($('#pw1') as HTMLInputElement).value, b = ($('#pw2') as HTMLInputElement).value;
    if (a.length < 6) return toast('Password must be at least 6 characters'); if (a !== b) return toast('Passwords don’t match');
    try { await state.store.updatePassword(a); ($('#pw1') as HTMLInputElement).value = ($('#pw2') as HTMLInputElement).value = ''; toast('Password changed'); } catch (err: any) { toast(err.message); } return;
  }
  if (t.closest('#replay')) { resetTours(); await flushSettings(); location.hash = ''; location.reload(); return; }
  if (t.closest('#dl')) {
    const data = { exported: new Date().toISOString(), app: 'Bluies Finest', profile: { name: state.me?.name }, bodyweightKg: state.priv.bodyweightKg, settings: S, sessions: mySessions() };
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = `bluies-finest-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); toast('Data downloaded'); return;
  }
  if (t.closest('#logout')) { await state.store.signOut(); return; }
  if (t.closest('#delAcc')) {
    if (!await confirmSheet('Delete your account?', 'This permanently deletes your profile, photo, every session, heart and comment. It can’t be undone. Consider downloading your data first.', 'Continue')) return;
    const typed = await promptSheet('Are you sure?', 'Type <b>DELETE</b> to confirm.', 'DELETE', 'Delete forever');
    if (typed !== 'DELETE') return toast('Account not deleted');
    try { await state.store.deleteAccount(); try { localStorage.removeItem('bf.settings'); } catch { /* ignore */ } toast('Account deleted'); } catch (err: any) { toast(err.message); }
  }
}
