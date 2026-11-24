// Sheets (✕ to close, typing prompts above the keyboard), swipes, renaming boards, the fuller session editor,
// achievement pop-ups and the Quick Sesh rename, through the real views.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Session } from '../src/lib/types';
import { session } from './helpers';

vi.mock('../src/main', () => ({ go: vi.fn(async () => true), ACCENTS: ['#8fb3d1'], applyTheme() {}, refreshHeader() {}, rerender: async () => {} }));

let S: typeof import('../src/lib/state');
let ui: typeof import('../src/lib/ui');
let updates: { id: string; patch: Record<string, unknown> }[];
let updateError: ((patch: Record<string, unknown>) => Error | null) | null;

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const $$ = <T extends HTMLElement = HTMLElement>(s: string) => [...document.querySelectorAll<T>(s)];
const flush = () => vi.advanceTimersByTimeAsync(50);
const sheetButtons = () => $$<HTMLButtonElement>('.modal .sheet > .row button');
/** A finger swipe from (x0, y) to (x1, y), as the touch events the browser sends. */
function swipe(el: Element, x0: number, x1: number, y0 = 300, y1 = y0) {
  const ev = (type: string, x: number, y: number) => {
    const e = new Event(type, { bubbles: true }); const t = [{ clientX: x, clientY: y }];
    Object.assign(e, { touches: type === 'touchend' ? [] : t, changedTouches: t });
    el.dispatchEvent(e);
  };
  ev('touchstart', x0, y0); ev('touchend', x1, y1);
}

async function openApp(sessions: Session[] = []) {
  document.body.innerHTML = '<div id="view-hang"></div><div id="view-workouts"></div><div id="view-profile"></div>';
  vi.resetModules();
  S = await import('../src/lib/state');
  ui = await import('../src/lib/ui');
  S.state.store = {
    kind: 'local', currentUserId: () => 'u1', savePrivate: async () => {},
    updateSession: async (id: string, patch: Record<string, unknown>) => { const e = updateError?.(patch); if (e) throw e; updates.push({ id, patch: { ...patch } }); },
  } as any;
  S.state.me = { id: 'u1', name: 'Tess', avatarUrl: null, isAdmin: false, createdAt: '2026-01-01T00:00:00Z' };
  S.state.profiles = new Map([['u1', S.state.me]]);
  S.state.priv = { bodyweightKg: 70, settings: {} };
  S.state.sessions = sessions;
  S.state.settings = S.DEFAULT_SETTINGS();
  S.state.loaded = true;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance', 'Date'] });
  vi.setSystemTime(new Date('2026-11-23T10:00:00Z'));
  window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as any;
  window.scrollTo = (() => {}) as any;
  Element.prototype.scrollIntoView = () => {};
  localStorage.clear();
  updates = []; updateError = null;
  await openApp();
});
afterEach(() => { vi.useRealTimers(); });

describe('sheets', () => {
  it('without buttons: a ✕ in the corner closes it, and there is no Close row', async () => {
    const done = ui.sheet({ title: 'Info', body: '<p>Hi</p>' });
    expect($('.modal .sheet-x')).not.toBeNull();
    expect($('.modal .sheet > .row')).toBeNull();
    $('.modal .sheet-x').click();
    expect(await done).toBe(-1);
    expect($('.modal')).toBeNull();
  });
  it('with buttons: the buttons, and no ✕', async () => {
    const done = ui.sheet({ title: 'Sure?', buttons: [{ label: 'No' }, { label: 'Yes', kind: 'primary' }] });
    expect($('.modal .sheet-x')).toBeNull();
    sheetButtons()[1]!.click();
    expect(await done).toBe(1);
  });
  it('a name prompt sits in the middle of the screen, not at the bottom under the keyboard', async () => {
    const name = ui.promptSheet('Custom exercise', 'Name it', 'e.g. Long hangs');
    expect($('.modal').classList.contains('mid')).toBe(true);
    $<HTMLInputElement>('.modal input').value = 'Long hangs';
    sheetButtons()[1]!.click();
    expect(await name).toBe('Long hangs');
  });
});

describe('swiping', () => {
  it('on the Hang page, left goes to Workout and right back to Single session', async () => {
    const hang = await import('../src/views/hang');
    hang.renderHang($('#view-hang'));
    const on = () => $('#hangMode .on')?.getAttribute('data-m');
    expect(on()).toBe('single');
    swipe($('#paramCard'), 300, 120);
    expect(on()).toBe('workout');
    expect(S.state.settings.hangMode).toBe('workout');
    swipe($('#wkEmpty'), 80, 300);
    expect(on()).toBe('single');
  });
  it('ignores scrolling, short moves and swipes that start on a number field', async () => {
    const hang = await import('../src/views/hang');
    hang.renderHang($('#view-hang'));
    const on = () => $('#hangMode .on')?.getAttribute('data-m');
    swipe($('#paramCard'), 300, 160, 500, 200); // mostly up: a scroll
    swipe($('#paramCard'), 300, 260);           // too short
    swipe($('#i-hang') ?? $('[data-pi]') ?? $('#params input'), 300, 100); // on a field
    expect(on()).toBe('single');
  });
  it('in the workout editor, right goes back like ‹ Go back', async () => {
    const wk = await import('../src/views/workouts');
    wk.renderWorkouts($('#view-workouts'));
    await wk.openBuilder(null);
    wk.renderWorkouts($('#view-workouts'));
    expect($('#wbBack').textContent).toBe('‹ Go back');
    swipe($('#view-workouts .card'), 40, 260);
    await flush();
    expect($('#wbBack')).toBeNull();
    expect($('#wkNew')).not.toBeNull(); // back on the list
  });
  it('a mouse drag on the page works too, but not one that starts on a button', async () => {
    const hang = await import('../src/views/hang');
    hang.renderHang($('#view-hang'));
    const drag = (el: Element, x0: number, x1: number) => {
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x0, clientY: 200, button: 0 }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x1, clientY: 200, button: 0 }));
    };
    drag($('#start'), 300, 100);
    expect($('#hangMode .on')?.getAttribute('data-m')).toBe('single');
    drag($('#paramCard'), 300, 100);
    expect($('#hangMode .on')?.getAttribute('data-m')).toBe('workout');
  });
});

describe('My hangboards', () => {
  it('a board can be renamed, keeping it the default', async () => {
    const prof = await import('../src/views/profile');
    prof.renderProfile($('#view-profile'));
    const B = S.state.settings.boards, first = B.list[0]!;
    $(`[data-renb="${first}"]`).click(); await flush();
    expect($('.modal').classList.contains('mid')).toBe(true);
    expect($<HTMLInputElement>('.modal input').value).toBe(first);
    $<HTMLInputElement>('.modal input').value = 'Garage board';
    sheetButtons()[1]!.click(); await flush();
    expect(B.list[0]).toBe('Garage board');
    expect(B.list).not.toContain(first);
    expect(B.def).toBe('Garage board');
    expect(B.custom).toContain('Garage board');
    expect($('#boardList').textContent).toContain('Garage board');
  });
  it('won’t rename one to a name you already have', async () => {
    const prof = await import('../src/views/profile');
    prof.renderProfile($('#view-profile'));
    const B = S.state.settings.boards, [a, b] = B.list;
    $(`[data-renb="${a}"]`).click(); await flush();
    $<HTMLInputElement>('.modal input').value = b!;
    sheetButtons()[1]!.click(); await flush();
    expect(B.list.filter(x => x === b)).toHaveLength(1);
    expect(B.list).toContain(a);
  });
});

describe('editing a logged session', () => {
  const open = async (s: Session) => {
    await openApp([s]);
    const wk = await import('../src/views/workouts');
    wk.renderWorkouts($('#view-workouts'));
    $(`#recent .lrow[data-sid="${s.id}"] [data-ed]`).click(); await flush();
  };
  it('shows the timings, and edits grip, fingers, board, edge, feel, effort rating and note', async () => {
    const s = session({ id: 'e1', grip: 'Half crimp', fingers: 'All 4', board: 'Beastmaker 1000', edgeMaterial: 'Wood', edgeProfile: 'Rounded', feel: '🙂', rpe: 7, note: '' });
    await open(s);
    expect($('.modal .sedit-sum').textContent).toContain('10s hangs');
    expect($('.modal .sedit-sum').textContent).toContain('5 sets');
    $('.modal [data-sk="grip"] [data-v="Drag"]').click();
    $('.modal [data-sk="fingers"] [data-v="Front 3"]').click();
    $('.modal [data-sk="edgeProfile"] [data-v="Flat"]').click();
    $('.modal [data-sk="feel"] [data-v="💪"]').click();
    const board = $<HTMLSelectElement>('.modal select[data-f="board"]'); board.value = 'Tension Block';
    const rpe = $<HTMLInputElement>('.modal [data-f="rpe"]'); rpe.value = '9'; rpe.dispatchEvent(new Event('input'));
    $<HTMLTextAreaElement>('.modal [data-f="note"]').value = 'Felt strong';
    sheetButtons()[1]!.click(); await flush();
    expect(updates).toHaveLength(1);
    expect(updates[0]!.patch).toMatchObject({ grip: 'Drag', fingers: 'Front 3', edgeProfile: 'Flat', feel: '💪', board: 'Tension Block', rpe: 9, note: 'Felt strong' });
    expect(updates[0]!.patch).not.toHaveProperty('edgeMaterial'); // unchanged
    expect(updates[0]!.patch).not.toHaveProperty('loadPct');      // the load didn't change
    expect(s.grip).toBe('Drag');
  });
  it('tapping the picked chip again leaves it blank', async () => {
    const s = session({ id: 'e2', feel: '🙂' });
    await open(s);
    $('.modal [data-sk="feel"] [data-v="🙂"]').click();
    sheetButtons()[1]!.click(); await flush();
    expect(updates[0]!.patch.feel).toBe('');
  });
  it('a session that was never rated stays unrated unless the slider is moved', async () => {
    const s = session({ id: 'e3', rpe: null });
    await open(s);
    expect($('#seRpeV').textContent).toContain('Not rated');
    $<HTMLTextAreaElement>('.modal [data-f="note"]').value = 'x';
    sheetButtons()[1]!.click(); await flush();
    expect(updates[0]!.patch).not.toHaveProperty('rpe');
  });
  it('a database without the latest update still saves the load and note', async () => {
    updateError = p => ('grip' in p ? Object.assign(new Error('permission denied for table sessions'), { code: '42501' }) : null);
    const s = session({ id: 'e4', addedKg: 0 });
    await open(s);
    $('.modal [data-sk="grip"] [data-v="Open"]').click();
    $<HTMLInputElement>('.modal [data-f="addedKg"]').value = '5';
    sheetButtons()[1]!.click(); await flush();
    expect(updates).toHaveLength(1);
    expect(updates[0]!.patch).toMatchObject({ addedKg: 5 });
    expect(updates[0]!.patch).not.toHaveProperty('grip');
    expect(s.grip).toBe('Half crimp');
    expect($('#toast').textContent).toContain('schema.sql');
  });
});

describe('achievement pop-ups', () => {
  it('the first check stays quiet; after that each new one pops up once', async () => {
    S.state.sessions = [session({ userId: 'u1' })];
    const { checkUnlocks } = await import('../src/views/unlocks');
    checkUnlocks(); await flush(); await vi.advanceTimersByTimeAsync(300);
    expect(S.state.settings.achSeen?.['o:First Hang']).toBe(1); // already earned before this version: no pop
    expect($('.unlock')).toBeNull();

    S.state.settings.boards.custom.push('Garage board');
    checkUnlocks(); await vi.advanceTimersByTimeAsync(300);
    expect($('.unlock')?.textContent).toContain('Board Collector');

    $('.unlock')?.remove();
    checkUnlocks(); await vi.advanceTimersByTimeAsync(300);
    expect($('.unlock')).toBeNull(); // not again
  });
  it('secrets found mid-session and tier-ups pop up too', async () => {
    const { checkUnlocks } = await import('../src/views/unlocks');
    checkUnlocks(); await vi.advanceTimersByTimeAsync(300); // seed: nothing earned yet
    S.state.settings.flags.chalkBucket = true;
    S.state.sessions = [session({ userId: 'u1' })];
    checkUnlocks(); await vi.advanceTimersByTimeAsync(300);
    const text = $('.unlock')!.textContent!;
    expect(text).toContain('achievements unlocked');
    expect(text).toContain('Secret: Chalk Bucket');
    expect(text).toContain('Sessions');
    expect(text).toContain('Iron');
  });
  it('saving a session on the Hang page pops what it earned', async () => {
    const { checkUnlocks } = await import('../src/views/unlocks');
    checkUnlocks(); await vi.advanceTimersByTimeAsync(300);
    const hang = await import('../src/views/hang');
    (S.state.store as any).addSession = async (s: any) => ({ ...s, userId: 'u1' });
    Object.assign(S.state.settings.prefs, { ready: 0, warmup: false, nudges: false });
    hang.renderHang($('#view-hang'));
    $<HTMLInputElement>('#i-sets').value = '1'; $('#i-sets').dispatchEvent(new Event('change', { bubbles: true }));
    $('#start').click(); await flush();
    for (let i = 0; i < 40 && $('#v-done').classList.contains('hide'); i++) await vi.advanceTimersByTimeAsync(1000);
    expect($('#v-done').classList.contains('hide')).toBe(false);
    $('#saveSess').click(); await flush(); await vi.advanceTimersByTimeAsync(300);
    expect($('.unlock')?.getAttribute('aria-label')).toContain('First Hang');
  });
  it('what’s been shown merges across devices, keeping the higher tier', async () => {
    const { mergeSeen } = await import('../src/lib/achievements');
    expect(mergeSeen({ 't:Sessions': 2, 'o:First Hang': 1 }, { 't:Sessions': 1, 'o:Night Owl': 1 })).toEqual({ 't:Sessions': 2, 'o:First Hang': 1, 'o:Night Owl': 1 });
  });
});

describe('⚡ Quick Sesh', () => {
  it('is the new name, and older sessions saved as JUST LET ME HANG or QUICK SESH show it too', async () => {
    const P = await import('../src/lib/protocols');
    expect(P.PROTOCOLS.jlmh!.n).toBe('Quick Sesh');
    expect(P.currentName('JUST LET ME HANG')).toBe('Quick Sesh');
    expect(P.currentName('QUICK SESH')).toBe('Quick Sesh');
    expect(P.currentName('Max Hangs')).toBe('Max Hangs');
  });
});

describe('logging a past session', () => {
  const local = (d: Date) => new Date(+d - d.getTimezoneOffset() * 60e3).toISOString().slice(0, 16);
  const open = async () => {
    const added: any[] = [];
    (S.state.store as any).addSession = async (x: any) => { added.push(x); return { ...x, userId: 'u1' }; };
    Object.assign(S.state.settings.prefs, { warmup: false, nudges: false });
    const hang = await import('../src/views/hang');
    hang.renderHang($('#view-hang'));
    $('#backlog').click(); await flush();
    return added;
  };
  const promise = async (when: string) => {
    $<HTMLInputElement>('#blWhen').value = when;
    sheetButtons().find(b => b.textContent === 'I promise')!.click(); await flush();
  };
  it('opens without popping up the date picker', async () => {
    await open();
    expect($('#blWhen')).not.toBeNull();
    expect(document.activeElement).not.toBe($('#blWhen'));
    expect(document.activeElement).toBe($('.modal .sheet'));
  });
  it('saves it with the date and time picked, every hang held, and scores it', async () => {
    const added = await open();
    const when = new Date(Date.now() - 3 * 864e5); when.setHours(18, 30, 0, 0);
    await promise(local(when));
    expect($('#v-done').classList.contains('hide')).toBe(false);
    expect($('#res').textContent).toContain('Logged for');
    $('#saveSess').click(); await flush();
    expect(added).toHaveLength(1);
    const s = added[0]!;
    expect(local(new Date(s.createdAt))).toBe(local(when)); // same minute (the seconds are borrowed from now)
    expect(s.fullHangs).toBe(s.totalHangs);
    expect(s.totalHangs).toBe(5); // Max Hangs: 5 hangs
    expect(s.points).toBeGreaterThan(0);
    expect(S.state.sessions[0]!.createdAt).toBe(s.createdAt);
  });
  it('won’t go back more than 7 days, into the future, or with no date', async () => {
    const added = await open();
    await promise(local(new Date(Date.now() - 8 * 864e5)));
    expect($('#toast').textContent).toContain('up to 7 days');
    $('#backlog').click(); await flush();
    await promise(local(new Date(Date.now() + 2 * 3600e3)));
    expect($('#toast').textContent).toContain('up to 7 days');
    $('#backlog').click(); await flush();
    await promise('');
    expect($('#toast').textContent).toBe('Pick when you did it');
    expect($('#v-done').classList.contains('hide')).toBe(true);
    expect(added).toHaveLength(0);
  });
});

describe('the get-ready countdown', () => {
  it('a change in Profile applies to the next session straight away', async () => {
    Object.assign(S.state.settings.prefs, { ready: 0, warmup: false, nudges: false });
    const hang = await import('../src/views/hang');
    hang.renderHang($('#view-hang'));
    S.state.settings.prefs.ready = 10; // changed in Profile after the Hang page was drawn
    $('#start').click(); await flush();
    expect($('#ph').textContent).toBe('Get ready');
  });
});

describe('no-hang lifts count only the weight lifted', () => {
  const pickQuick = async () => {
    Object.assign(S.state.settings.prefs, { warmup: false, nudges: false });
    const hang = await import('../src/views/hang');
    hang.renderHang($('#view-hang'));
    const sel = $<HTMLSelectElement>('#proto'); sel.value = 'jlmh'; sel.dispatchEvent(new Event('change'));
  };
  it('Quick Sesh can be a lift: it starts at 0 kg, and 10 kg in one hand is 14% of bodyweight on one arm', async () => {
    await pickQuick();
    expect($('#modeWrap').classList.contains('hide')).toBe(false);
    $('[data-k="mode"] [data-v="lift"]').click();
    expect($<HTMLInputElement>('#i-lift').value).toBe('0');
    expect($('#loadHint').textContent).toContain('just the plates or dumbbell');
    expect($('#i-add')).toBeNull(); // no added weight on top of bodyweight in a lift
    $('[data-k="hands"] [data-v="L"]').click();
    const i = $<HTMLInputElement>('#i-lift'); i.value = '10'; i.dispatchEvent(new Event('change', { bubbles: true }));
    $('[data-k="hands"] [data-v="L"]').click(); // redraw the hint with the typed weight
    expect($('#loadHint').textContent).toContain('Lifting 10kg in one hand ≈ 14% of bodyweight, on one arm');
  });
  it('a one-arm lift of 10 kg scores far less than a one-arm hang with 10 kg added', async () => {
    const added: any[] = [];
    (S.state.store as any).addSession = async (x: any) => { added.push(x); return { ...x, userId: 'u1' }; };
    await pickQuick();
    const log = async (mode: 'hang' | 'lift') => {
      $(`[data-k="mode"] [data-v="${mode}"]`).click();
      $('[data-k="hands"] [data-v="L"]').click();
      const i = $<HTMLInputElement>(mode === 'lift' ? '#i-lift' : '#i-add'); i.value = '10'; i.dispatchEvent(new Event('change', { bubbles: true }));
      $('#backlog').click(); await flush();
      sheetButtons().find(b => b.textContent === 'I promise')!.click(); await flush();
      $('#saveSess').click(); await flush();
      return added.at(-1);
    };
    const asHang = await log('hang'), asLift = await log('lift');
    expect([asHang.mode, asHang.addedKg, asHang.loadPct]).toEqual(['hang', 10, 114]);
    expect([asLift.mode, asLift.liftKg, asLift.addedKg, asLift.loadPct]).toEqual(['lift', 10, 0, 29]);
    expect(asLift.points).toBeLessThan(asHang.points / 4);
  });
  it('the workout exercise editor offers hang or lift for Quick Sesh too', async () => {
    const WP = await import('../src/views/workout-parts');
    const W = await import('../src/lib/workouts');
    const P = (await import('../src/lib/protocols')).PROTOCOLS;
    const done = WP.editBlock(W.makeBlock('jlmh', P.jlmh!, undefined), { index: 0, count: 1, structure: false });
    await flush();
    expect($('.modal [data-bk="mode"] [data-v="lift"]')).not.toBeNull();
    $('.modal [data-bk="mode"] [data-v="lift"]').click();
    expect($('.modal [data-pi="lift"]')).not.toBeNull();
    sheetButtons()[0]!.click(); await done;
  });
  it('a session logged as a hang by mistake can be switched to a lift in Edit session', async () => {
    const hangs = Array.from({ length: 6 }, (_, i) => ({ set: i + 1, rep: 1, hand: 'L' as const, target: 10, held: 10, full: true }));
    const s = session({ id: 'm1', protocolKey: 'jlmh', protocolName: 'Quick Sesh', mode: 'hang', hands: 'L', addedKg: 10, loadPct: 114, hangs, tutS: 60, fullHangs: 6, totalHangs: 6, points: 0 });
    const { sessionPoints } = await import('../src/lib/scoring');
    s.points = sessionPoints(s, [s]);
    await openApp([s]);
    const wk = await import('../src/views/workouts');
    wk.renderWorkouts($('#view-workouts'));
    $('#recent [data-ed]').click(); await flush();
    expect($('.modal [data-for="lift"]').classList.contains('hide')).toBe(true);
    $('.modal [data-sk="mode"] [data-v="lift"]').click();
    expect($('.modal [data-for="lift"]').classList.contains('hide')).toBe(false);
    expect($('.modal [data-f="addedKg"]').closest('[data-for]')!.classList.contains('hide')).toBe(true);
    $<HTMLInputElement>('.modal [data-f="liftKg"]').value = '10';
    $('.modal [data-sk="mode"] [data-v="lift"]').click(); // tapping the picked one again keeps it (never blank)
    const before = s.points;
    sheetButtons()[1]!.click(); await flush();
    expect(updates[0]!.patch).toMatchObject({ mode: 'lift', liftKg: 10, addedKg: 0, loadPct: 29 });
    expect(s.points).toBeLessThan(before / 4);
  });
  it('on a database without the latest update, switching hang and lift saves nothing and says why', async () => {
    updateError = p => ('mode' in p ? Object.assign(new Error('permission denied for table sessions'), { code: '42501' }) : null);
    const s = session({ id: 'm2', mode: 'hang', addedKg: 10 });
    await openApp([s]);
    const wk = await import('../src/views/workouts');
    wk.renderWorkouts($('#view-workouts'));
    $('#recent [data-ed]').click(); await flush();
    $('.modal [data-sk="mode"] [data-v="lift"]').click();
    $<HTMLInputElement>('.modal [data-f="liftKg"]').value = '10';
    sheetButtons()[1]!.click(); await flush();
    expect(updates).toHaveLength(0);
    expect(s.mode).toBe('hang');
    expect($('#toast').textContent).toContain('between a hang and a lift');
  });
});

describe('lifts aren’t hangs in personal bests', () => {
  it('Longest hang on Stats leaves out a long lift hold', async () => {
    const held = (mode: 'hang' | 'lift', t: number) => session({ mode, hangs: [{ set: 1, rep: 1, hand: 'L', target: t, held: t, full: true }] });
    await openApp([held('hang', 12), held('lift', 90)]);
    document.body.insertAdjacentHTML('beforeend', '<div id="view-stats"></div>');
    const st = await import('../src/views/stats');
    st.renderStats($('#view-stats'));
    const row = [...document.querySelectorAll('#pbs .lrow')].find(r => r.textContent!.includes('Longest hang'))!;
    expect(row.textContent).toContain('12 s');
    expect(row.textContent).not.toContain('90 s');
  });
});

describe('a lift of nothing', () => {
  it('can’t be started, logged or saved by editing', async () => {
    Object.assign(S.state.settings.prefs, { warmup: false, nudges: false });
    const added: any[] = [];
    (S.state.store as any).addSession = async (x: any) => { added.push(x); return { ...x, userId: 'u1' }; };
    const hang = await import('../src/views/hang');
    hang.renderHang($('#view-hang'));
    $('[data-k="mode"] [data-v="lift"]').click();
    expect($<HTMLInputElement>('#i-lift').value).toBe('0');
    $('#start').click(); await flush();
    expect($('#v-timer').classList.contains('hide')).toBe(true);
    expect($('#toast').textContent).toContain('Set the weight you’ll lift first');
    $('#backlog').click(); await flush();
    expect($('.modal')).toBeNull();
    // a workout with a weightless lift in it won't start either
    const W = await import('../src/lib/workouts');
    const P = (await import('../src/lib/protocols')).PROTOCOLS;
    const w = { id: 'wl', name: 'Lifts', updatedAt: 0, blocks: [W.makeBlock('rec', P.rec!, undefined)] };
    expect(await hang.beginWorkout(w)).toBe(false);
    expect($('#toast').textContent).toContain('no-hang lift with no weight');
    expect(added).toHaveLength(0);
  });
  it('Edit session won’t switch a hang to a lift without a weight', async () => {
    const s = session({ id: 'z1', mode: 'hang', addedKg: 0, liftKg: 0 });
    await openApp([s]);
    const wk = await import('../src/views/workouts');
    wk.renderWorkouts($('#view-workouts'));
    $('#recent [data-ed]').click(); await flush();
    $('.modal [data-sk="mode"] [data-v="lift"]').click();
    sheetButtons()[1]!.click(); await flush();
    expect(updates).toHaveLength(0);
    expect($('#toast').textContent).toContain('Enter the weight you lifted');
  });
});
