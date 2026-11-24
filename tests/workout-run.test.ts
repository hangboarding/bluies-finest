// Runs whole workouts through the real Hang page (DOM, timer, summary, saving) with a fake clock.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NewSession, Session } from '../src/lib/types';
import type { Workout } from '../src/lib/workouts';

vi.mock('../src/main', () => ({ go: vi.fn(async () => true) }));

let hang: typeof import('../src/views/hang');
let S: typeof import('../src/lib/state');
let W: typeof import('../src/lib/workouts');
let P: typeof import('../src/lib/protocols')['PROTOCOLS'];
let WP: typeof import('../src/views/workout-parts');
let saved: (NewSession & { id: string })[];

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const sec = (n: number) => vi.advanceTimersByTime(n * 1000);
const flush = () => vi.advanceTimersByTimeAsync(50);
const visible = (id: string) => !$(id).classList.contains('hide');
const sheetButtons = () => [...document.querySelectorAll<HTMLButtonElement>('.modal .sheet > .row button')];

/** A short two-exercise workout: a warm-up (2 × 3s), 5s rest, then density hangs (2 × 4s, +5kg). */
function workout(): Workout {
  return {
    id: 'w1', name: 'Test day', updatedAt: 0, blocks: [
      W.makeBlock('warm', P.warm!, { hang: 3, rest: 2, sets: 2 }, { restAfter: 5 }),
      W.makeBlock('dens', P.dens!, { hang: 4, rest: 2, sets: 2, add: 5 }, { restAfter: 0 }),
    ],
  };
}

/** Load the app's modules afresh (like opening the app) and sign in a test climber. `workouts` = saved workouts
 *  to start with; localStorage is left as it is, so a reload keeps the unsaved-workout backup. */
async function openApp(workouts: Workout[] | null = null, settings?: ReturnType<typeof S.DEFAULT_SETTINGS>) {
  document.body.innerHTML = '<div id="view-hang"></div><div id="view-workouts"></div>';
  vi.resetModules(); // fresh module state (no workout left running from before)
  S = await import('../src/lib/state');
  W = await import('../src/lib/workouts');
  P = (await import('../src/lib/protocols')).PROTOCOLS;
  hang = await import('../src/views/hang');
  WP = await import('../src/views/workout-parts');
  S.state.store = {
    kind: 'local', currentUserId: () => 'u1', savePrivate: async () => {},
    addSession: async (s: NewSession & { id: string }) => { saved.push(s); return { ...s, userId: 'u1' } as Session; },
  } as any;
  S.state.me = { id: 'u1', name: 'Tess', avatarUrl: null, isAdmin: false, createdAt: '2026-01-01T00:00:00Z' };
  S.state.priv = { bodyweightKg: 70, settings: {} };
  S.state.sessions = [];
  S.state.settings = settings ?? S.DEFAULT_SETTINGS();
  S.state.settings.prefs.ready = 2;
  S.state.settings.workouts = workouts ?? [workout()];
  S.state.loaded = true;
  hang.renderHang($('#view-hang'));
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance', 'Date'] });
  vi.setSystemTime(new Date('2026-11-23T10:00:00Z'));
  // jsdom has no matchMedia (confetti checks reduced motion) or scrolling
  window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as any;
  window.scrollTo = (() => {}) as any;
  Element.prototype.scrollIntoView = () => {};
  localStorage.clear();
  saved = [];
  await openApp();
});
afterEach(() => { vi.useRealTimers(); });

describe('running a workout', () => {
  it('runs every exercise with the rest between, then saves one session each', async () => {
    expect(await hang.beginWorkout(W.cloneWorkout(S.state.settings.workouts[0]!))).toBe(true);
    expect(visible('#v-timer')).toBe(true);
    expect($('#wprog').textContent).toContain('Exercise 1 of 2');
    expect($('#ph').textContent).toBe('Get ready');

    sec(2 + 3 + 2 + 3); // get-ready, hang, rest, hang: the warm-up is done
    sec(0.2);
    expect($('#ph').textContent).toBe('Rest');
    expect($('#setlbl').textContent).toBe('Next: Density Hangs');
    expect(JSON.parse(localStorage.getItem('bf.wip')!).done).toHaveLength(1); // kept in case the app closes

    sec(5.2); // the rest; there was a rest, so no second get-ready
    expect($('#ph').textContent).toBe('Hang!');
    expect($('#wprog').textContent).toContain('Exercise 2 of 2');

    sec(4 + 2 + 4 + 1);
    expect(visible('#v-done')).toBe(true);
    expect($('#saveSess').textContent).toBe('Save workout (2 sessions)');
    expect(document.querySelectorAll('#wkRes .wkr')).toHaveLength(2);

    // rate the second one easy, add a note, save
    const r = $<HTMLInputElement>('#wkRes input[data-j="1"]'); r.value = '4'; r.dispatchEvent(new Event('input', { bubbles: true }));
    $<HTMLInputElement>('#note').value = 'Felt strong';
    $('#saveSess').click();
    await flush();

    expect(saved.map(s => [s.protocolKey, s.totalHangs, s.fullHangs, s.hang, s.addedKg, s.rpe, s.note])).toEqual([
      ['warm', 2, 2, 3, 0, 7, ''],
      ['dens', 2, 2, 4, 5, 4, 'Felt strong'],   // the note goes on the last exercise
    ]);
    expect(saved[0]!.createdAt! < saved[1]!.createdAt!).toBe(true);
    expect(S.state.sessions).toHaveLength(2);
    // felt easy: that exercise is 2.5kg heavier in the saved workout next time
    const lib = S.state.settings.workouts[0]!;
    expect(lib.blocks[1]!.vals.add).toBe(7.5);
    expect(lib.blocks[1]!.adj).toMatch(/Felt easy/);
    expect(lib.lastRunAt).toBeGreaterThan(0);
    expect(localStorage.getItem('bf.wip')).toBeNull();
    expect(visible('#v-setup')).toBe(true);
    expect(hang.hangPending()).toBe(false);
  });

  it('each exercise can be named on the summary, and the name survives a reload', async () => {
    await hang.beginWorkout(W.cloneWorkout(S.state.settings.workouts[0]!));
    sec(2 + 3 + 2 + 3); sec(0.2); sec(5.2); sec(4 + 2 + 4 + 1);
    expect(visible('#v-done')).toBe(true);
    expect(visible('#sTitleW')).toBe(false); // one name per exercise instead
    const names = [...document.querySelectorAll<HTMLInputElement>('#wkRes input[data-tj]')];
    expect(names.map(n => n.value)).toEqual(['Warm-up', 'Density Hangs']);
    names[0]!.value = 'Easy laps'; names[0]!.dispatchEvent(new Event('change', { bubbles: true }));
    expect(JSON.parse(localStorage.getItem('bf.wip')!).done[0].s.title).toBe('Easy laps'); // kept in case the app closes

    // the app closes before it's saved, and comes back
    await openApp(S.state.settings.workouts);
    sec(1);
    sheetButtons()[1]!.click(); await flush(); // Review and save
    expect($<HTMLInputElement>('#wkRes input[data-tj="0"]').value).toBe('Easy laps');
    $('#saveSess').click(); await flush();
    expect(saved.map(s => [s.protocolName, s.title])).toEqual([['Warm-up', 'Easy laps'], ['Density Hangs', '']]);
  });

  it('ending early during the rest keeps the finished exercise', async () => {
    await hang.beginWorkout(W.cloneWorkout(S.state.settings.workouts[0]!));
    sec(10.2); // warm-up done, now resting
    $('#quit').click();
    await flush();
    const labels = sheetButtons().map(b => b.textContent);
    expect(labels).toEqual(['Keep going 💪', 'End workout early', 'Give up 🏳️']); // no "skip" while resting
    sheetButtons()[1]!.click();
    await flush();
    expect(visible('#v-done')).toBe(true);
    expect($('#saveSess').textContent).toBe('Save workout (1 session)');
  });

  it('skipping an exercise moves on and keeps what was done of it', async () => {
    await hang.beginWorkout(W.cloneWorkout(S.state.settings.workouts[0]!));
    sec(2 + 2); // get-ready, then 2s into the first hang
    $('#quit').click();
    await flush();
    sheetButtons().find(b => /Skip to the next/.test(b.textContent!))!.click();
    await flush();
    expect($('#ph').textContent).toBe('Rest');
    expect(JSON.parse(localStorage.getItem('bf.wip')!).done[0].s.hangs).toEqual([{ set: 1, rep: 1, hand: 'both', target: 3, held: 2, full: false }]);
  });

  it('giving up saves nothing and puts the Hang page back', async () => {
    await hang.beginWorkout(W.cloneWorkout(S.state.settings.workouts[0]!));
    sec(10.2);
    $('#quit').click(); await flush();
    sheetButtons().at(-1)!.click(); await flush();
    // an exercise is already done, so it checks first
    expect(document.querySelector('.modal .sub')?.textContent).toBe('The exercise you’ve finished won’t be saved.');
    sheetButtons().find(b => b.textContent === 'Give up')!.click(); await flush();
    expect(visible('#v-setup')).toBe(true);
    expect(saved).toHaveLength(0);
    expect(localStorage.getItem('bf.wip')).toBeNull();
    expect(hang.hangPending()).toBe(false);
  });

  it('a rest that ran out while the app was in the background starts the next one with a get-ready', async () => {
    await hang.beginWorkout(W.cloneWorkout(S.state.settings.workouts[0]!));
    sec(10.2);
    expect($('#ph').textContent).toBe('Rest');
    const now = performance.now.bind(performance);
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => now() + 60_000); // the phone was locked for a minute
    sec(0.2);
    expect($('#ph').textContent).toBe('Get ready');
    spy.mockRestore();
  });

  it('won’t start a second workout over one that’s running', async () => {
    await hang.beginWorkout(W.cloneWorkout(S.state.settings.workouts[0]!));
    expect(await hang.beginWorkout(W.cloneWorkout(S.state.settings.workouts[0]!))).toBe(false);
  });
});

describe('after a reload', () => {
  it('offers back finished exercises that weren’t saved', async () => {
    const w = workout();
    const s = { protocolKey: 'warm', protocolName: 'Warm-up', mode: 'hang', hang: 3, rest: 2, sets: 2, reps: 1, setRest: 180, edgeMm: 25, addedKg: 0, assistKg: 0, liftKg: 0, effortPct: 60,
      hands: 'both', grip: 'Open', fingers: 'All 4', board: 'Gym board', edgeMaterial: 'Wood', edgeProfile: 'Flat', feel: '🙂', rpe: 7, tutS: 6, fullHangs: 2, totalHangs: 2,
      hangs: [], loadPct: 100, points: 3, isPb: false, note: '', createdAt: new Date(Date.now() - 60e3).toISOString() };
    localStorage.setItem('bf.wip', JSON.stringify({ owner: 'u1', at: Date.now() - 60e3, w, done: [{ blockId: w.blocks[0]!.id, name: 'Warm-up', s }] }));
    document.body.innerHTML = '<div id="view-hang"></div>';
    hang.renderHang($('#view-hang'));
    sec(1);
    expect(document.querySelector('.modal h2')?.textContent).toBe('Unsaved workout');
    sheetButtons()[1]!.click(); // Review and save
    await flush();
    expect(visible('#v-done')).toBe(true);
    $('#saveSess').click();
    await flush();
    expect(saved.map(x => x.protocolKey)).toEqual(['warm']);
    expect(localStorage.getItem('bf.wip')).toBeNull();
  });

  it('ignores a backup from someone else or from days ago', async () => {
    localStorage.setItem('bf.wip', JSON.stringify({ owner: 'someone-else', at: Date.now(), w: workout(), done: [{ blockId: 'x', name: 'x', s: {} }] }));
    document.body.innerHTML = '<div id="view-hang"></div>';
    hang.renderHang($('#view-hang'));
    sec(1);
    expect(document.querySelector('.modal')).toBeNull();
    expect(localStorage.getItem('bf.wip')).toBeNull();
  });
});

describe('Hang page modes', () => {
  it('switching to Workout shows the picked workout and its exercises', () => {
    $('#hangMode [data-m="workout"]').click();
    expect(visible('#wkCard')).toBe(true);
    expect(visible('#protoCard')).toBe(false);
    expect($('#wkName').textContent).toBe('Test day');
    expect(document.querySelectorAll('#wkQ .wq')).toHaveLength(2);
    expect($('#start').textContent).toContain('Start workout');
    expect(S.state.settings.hangMode).toBe('workout');
  });

  it('a single session paused for Edit can’t be switched to Workout mode', async () => {
    $('#start').click(); // single session, Max Hangs: the warm-up reminder appears first
    await flush();
    sheetButtons()[0]!.click(); // "Skip, I'm warm"
    await flush();
    expect(visible('#v-timer')).toBe(true);
    $('#edit').click();
    expect(visible('#hangMode')).toBe(false);
    $('#hangMode [data-m="workout"]').click();
    expect(visible('#paramCard')).toBe(true);
  });
});

describe('custom protocols', () => {
  /** A custom protocol, used as a third exercise in the saved workout, and picked on the Hang page. */
  function custom() {
    const k = WP.createCustomProto('Long 25s', W.protoValues(P.dens!, { hang: 25 }));
    const lib = S.state.settings.workouts[0]!;
    lib.blocks.push(W.makeBlock(k, S.state.settings.customProtos[k]!, undefined));
    document.dispatchEvent(new CustomEvent('bf:protocols-changed'));
    const sel = $<HTMLSelectElement>('#proto'); sel.value = k; sel.dispatchEvent(new Event('change'));
    expect($('#protoName').textContent).toContain('Long 25s');
    return k;
  }

  it('deleting one removes it, takes it out of workouts, and the Hang page falls back to Max Hangs', async () => {
    const k = custom();
    S.state.sessions = [{ protocolKey: k, protocolName: 'Long 25s', userId: 'u1' } as Session];
    const done = WP.deleteCustomProto(k);
    await flush();
    expect(document.querySelector('.modal .sub')?.textContent).toContain('taken out of your workout “Test day”');
    sheetButtons()[1]!.click(); // Delete
    expect(await done).toBe(true);
    expect(S.state.settings.customProtos[k]).toBeUndefined();
    expect(S.state.settings.vals[k]).toBeUndefined();
    expect(S.state.settings.workouts[0]!.blocks.map(b => b.proto)).toEqual(['warm', 'dens']);
    expect(S.state.sessions[0]!.protocolName).toBe('Long 25s'); // logged sessions keep their name
    expect($('#protoName').textContent).toBe('Max Hangs');
    expect([...$<HTMLSelectElement>('#proto').options].some(o => o.value === k)).toBe(false);
  });

  it('cancelling keeps it', async () => {
    const k = custom();
    const done = WP.deleteCustomProto(k);
    await flush();
    sheetButtons()[0]!.click(); // Cancel
    expect(await done).toBe(false);
    expect(S.state.settings.customProtos[k]).toBeDefined();
  });

  it('can’t be deleted while a workout is running', async () => {
    const k = custom();
    await hang.beginWorkout(W.cloneWorkout(S.state.settings.workouts[0]!));
    expect(await WP.deleteCustomProto(k)).toBe(false);
    expect(document.querySelector('.modal')).toBeNull();
    expect(S.state.settings.customProtos[k]).toBeDefined();
  });

  it('the protocol picker has a delete button for each one and stays open', async () => {
    const k = custom();
    $('#protoBtn').click();
    await flush();
    expect(document.querySelectorAll('.protodel')).toHaveLength(1);
    $<HTMLButtonElement>(`.protodel[data-del="${k}"]`).click();
    await flush();
    sheetButtons().find(b => b.textContent === 'Delete')!.click();
    await flush();
    expect(document.querySelector('.protorow')).toBeNull();
    expect(document.querySelector('.protolist')).not.toBeNull(); // still picking
    expect(S.state.settings.customProtos[k]).toBeUndefined();
  });

  it('renaming changes the name everywhere it shows', async () => {
    const k = custom();
    const done = WP.renameCustomProto(k);
    await flush();
    const input = document.querySelector<HTMLInputElement>('.modal input')!;
    expect(input.value).toBe('Long 25s');
    input.value = 'Tendon 25s';
    sheetButtons()[1]!.click(); // Save
    expect(await done).toBe(true);
    expect(S.state.settings.customProtos[k]!.n).toBe('Tendon 25s');
    expect($('#protoName').textContent).toContain('Tendon 25s');
  });
});

describe('fixes from review', () => {
  const start = () => hang.beginWorkout(W.cloneWorkout(S.state.settings.workouts[0]!));

  it('resuming after Edit always counts down first, even on an exercise that started straight after a rest', async () => {
    await start();
    sec(10.2 + 5.2); // warm-up, rest; now hanging on exercise 2 (which has no get-ready of its own)
    expect($('#ph').textContent).toBe('Hang!');
    $('#edit').click();
    $('#start').click(); // "Resume with changes"
    await flush();
    expect($('#ph').textContent).toBe('Get ready');
  });

  it('skipping the rest between exercises counts down instead of dropping straight into a hang', async () => {
    await start();
    sec(10.2);
    expect($('#ph').textContent).toBe('Rest');
    $('#skip').click();
    expect($('#ph').textContent).toBe('Get ready');
  });

  it('a session keeps the same id from the backup through to saving, so a retried save can’t duplicate it', async () => {
    await start();
    sec(10.2);
    const id = JSON.parse(localStorage.getItem('bf.wip')!).done[0].s.id;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    $('#quit').click(); await flush();
    sheetButtons().find(b => b.textContent === 'End workout early')!.click(); await flush();
    $('#saveSess').click(); await flush();
    expect(saved[0]!.id).toBe(id);
  });

  it('one exercise the server rejects doesn’t stop the others saving', async () => {
    S.state.store.addSession = (async (s: NewSession & { id: string }) => {
      if (s.protocolKey === 'warm') throw Object.assign(new Error('out of range'), { code: '23514' });
      saved.push(s); return { ...s, userId: 'u1' } as Session;
    }) as any;
    await start();
    sec(30);
    $('#saveSess').click(); await flush();
    expect(saved.map(x => x.protocolKey)).toEqual(['dens']);
    expect($('#toast').textContent).toBe('Couldn’t save Warm-up: out of range. The other 1 was saved.');
    expect(hang.hangPending()).toBe(false);
  });

  it('after a reload, only exercises not already saved are offered back', async () => {
    await start();
    sec(30);
    const b = { ...JSON.parse(localStorage.getItem('bf.wip')!) };
    b.done[0].savedId = b.done[0].s.id; // the first one made it before the app closed
    localStorage.setItem('bf.wip', JSON.stringify(b));
    await openApp(); // the app was closed and opened again
    sec(1);
    expect(document.querySelector('.modal .sub')?.textContent).toContain('You did an exercise of');
    sheetButtons()[1]!.click(); await flush();
    expect($('#saveSess').textContent).toBe('Save workout (1 session)');
  });

  it('an unsaved workout has to be dealt with before another can start (so it isn’t overwritten)', async () => {
    await start();
    sec(10.2);
    await openApp(S.state.settings.workouts); // the app was closed mid-workout and opened again
    const started = start();
    await flush();
    expect(document.querySelector('.modal h2')?.textContent).toBe('Unsaved workout');
    expect(document.querySelector('.modal .sub')?.textContent).toContain('before starting another');
    sheetButtons()[0]!.click(); // Discard
    expect(await started).toBe(true);
    expect(localStorage.getItem('bf.wip')).toBeNull();
  });

  it('cancelling a new custom exercise adds nothing', async () => {
    const w = W.cloneWorkout(S.state.settings.workouts[0]!);
    const added = WP.addExercise(w);
    await flush();
    document.querySelector<HTMLElement>('.protoopt[data-k="__new"]')!.click(); await flush();
    document.querySelector<HTMLInputElement>('.modal input')!.value = 'Nope';
    sheetButtons()[1]!.click(); await flush();     // name it
    expect(document.querySelector('.modal h2')?.textContent).toContain('Nope');
    sheetButtons()[0]!.click(); await flush();     // then Cancel the editor
    expect(await added).toBe(false);
    expect(w.blocks).toHaveLength(2);
    expect(Object.values(S.state.settings.customProtos).map(p => p.n)).not.toContain('Nope');
  });

  it('a number typed into the exercise editor counts even if the field never lost focus', async () => {
    const b = S.state.settings.workouts[0]!.blocks[0]!;
    const edited = WP.editBlock(b, { index: 0, count: 2, structure: false });
    await flush();
    document.querySelector<HTMLInputElement>('.modal [data-pi="sets"]')!.value = '7'; // typed, no change event
    sheetButtons()[1]!.click(); // Done
    expect((await edited)!.block.vals.sets).toBe(7);
  });

  it('“Save as a workout” stays within 12 exercises when a warm-up was added', async () => {
    const twelve: Workout = { id: 'one-off', name: '', updatedAt: 0, blocks: Array.from({ length: 12 }, () => W.makeBlock('max', P.max!, { sets: 1, hang: 2 }, { restAfter: 0 })) };
    const started = hang.beginWorkout(twelve); // Max Hangs first, nothing done today: the warm-up reminder
    await flush();
    sheetButtons().find(b => b.textContent === 'Warm up first')!.click();
    expect(await started).toBe(true);
    expect($('#wprog').textContent).toContain('Exercise 1 of 13');
    sec(2 + 3); // get-ready, then 3s into the warm-up's first hang
    $('#quit').click(); await flush();
    sheetButtons().find(b => b.textContent === 'End workout early')!.click(); await flush();
    $('#saveAsW').click(); await flush();
    document.querySelector<HTMLInputElement>('.modal input')!.value = 'Twelve';
    sheetButtons()[1]!.click(); await flush();
    const w = S.state.settings.workouts.find(x => x.name === 'Twelve')!;
    expect(w.blocks).toHaveLength(12);
    expect(w.blocks.every(b => b.proto === 'max')).toBe(true);
  });
});

describe('the builder', () => {
  it('saving a draft opened before a run keeps that run’s load changes', async () => {
    const views = await import('../src/views/workouts');
    const lib = () => S.state.settings.workouts[0]!;
    await views.openBuilder(lib());
    views.renderWorkouts($('#view-workouts'));
    const name = $<HTMLInputElement>('#wbName'); name.value = 'Renamed'; name.dispatchEvent(new Event('input'));
    // meanwhile, the workout is run and its second exercise rated easy
    await hang.beginWorkout(W.cloneWorkout(lib()));
    sec(30);
    const r = $<HTMLInputElement>('#wkRes input[data-j="1"]'); r.value = '4'; r.dispatchEvent(new Event('input', { bubbles: true }));
    $('#saveSess').click(); await flush();
    expect(lib().blocks[1]!.vals.add).toBe(7.5);
    // back in the builder, save the rename
    views.renderWorkouts($('#view-workouts'));
    $('#wbSave').click(); await flush();
    expect(lib().name).toBe('Renamed');
    expect(lib().blocks[1]!.vals.add).toBe(7.5); // not undone by the older draft
    expect(lib().lastRunAt).toBeGreaterThan(0);
  });

  it('opening another workout asks before dropping unsaved changes', async () => {
    const views = await import('../src/views/workouts');
    await views.openBuilder(S.state.settings.workouts[0]!);
    views.renderWorkouts($('#view-workouts'));
    const name = $<HTMLInputElement>('#wbName'); name.value = 'Half-typed'; name.dispatchEvent(new Event('input'));
    const opening = views.openBuilder(null);
    await flush();
    expect(document.querySelector('.modal .sub')?.textContent).toContain('Your unsaved changes to “Half-typed” will be lost.');
    sheetButtons()[0]!.click(); // Keep editing
    await opening;
    views.renderWorkouts($('#view-workouts'));
    expect($<HTMLInputElement>('#wbName').value).toBe('Half-typed');
  });
});

describe('settings sync', () => {
  it('a workout made on this phone survives another phone saving its settings later', async () => {
    const mine = { ...S.DEFAULT_SETTINGS(), workouts: [workout()], savedAt: 1000, owner: 'u1' };
    const theirs = { ...S.DEFAULT_SETTINGS(), workouts: [], savedAt: 2000, prefs: { ...S.DEFAULT_SETTINGS().prefs, sound: false } };
    localStorage.setItem('bf.settings', JSON.stringify(mine));
    S.state.loaded = false;
    S.state.store = {
      kind: 'local', currentUserId: () => 'u1', savePrivate: vi.fn(async () => {}),
      listProfiles: async () => [S.state.me], getPrivate: async () => ({ bodyweightKg: 70, settings: theirs }),
      listSessions: async () => [], socialCounts: async () => ({ heartsReceived: 0, commentsGiven: 0 }),
      seasonChampions: async () => [], listChallenges: async () => [],
    } as any;
    await S.loadUserData();
    expect(S.state.settings.workouts.map(w => w.name)).toEqual(['Test day']); // merged back in
    expect(S.state.settings.prefs.sound).toBe(false);                         // the newer copy's other settings win
    sec(1); await flush();
    expect(S.state.store.savePrivate).toHaveBeenCalled();                     // and the merged copy is uploaded
  });

  it('a workout deleted on one phone doesn’t come back from another phone’s older copy', async () => {
    const w = workout();
    const mine = { ...S.DEFAULT_SETTINGS(), workouts: [w], savedAt: 1000, owner: 'u1' };
    const theirs = { ...S.DEFAULT_SETTINGS(), workouts: [], deleted: { [w.id]: Date.now() }, savedAt: 2000 };
    localStorage.setItem('bf.settings', JSON.stringify(mine));
    S.state.loaded = false;
    S.state.store = {
      kind: 'local', currentUserId: () => 'u1', savePrivate: async () => {},
      listProfiles: async () => [S.state.me], getPrivate: async () => ({ bodyweightKg: 70, settings: theirs }),
      listSessions: async () => [], socialCounts: async () => ({ heartsReceived: 0, commentsGiven: 0 }),
      seasonChampions: async () => [], listChallenges: async () => [],
    } as any;
    await S.loadUserData();
    expect(S.state.settings.workouts).toEqual([]);
  });
});

describe('picking a protocol', () => {
  const pick = async (k: string) => { $('#protoBtn').click(); await flush(); document.querySelector<HTMLElement>(`.protoopt[data-k="${k}"]`)!.click(); await flush(); };
  const set = (k: string, v: string) => { const i = $<HTMLInputElement>(`#i-${k}`); i.value = v; i.dispatchEvent(new Event('change', { bubbles: true })); };
  const num = (k: string) => $<HTMLInputElement>(`#i-${k}`).value;

  it('loads its recommended settings, but keeps your load for it', async () => {
    expect($('#protoName').textContent).toBe('Max Hangs');
    set('sets', '3'); set('hang', '12'); set('add', '10');
    await pick('rep');
    expect([num('hang'), num('sets'), num('reps'), num('add')]).toEqual(['7', '6', '6', '0']);
    await pick('max');
    expect([num('hang'), num('sets'), num('add')]).toEqual(['10', '5', '10']); // preset back, +10kg kept
  });

  it('picking the selected one again resets it', async () => {
    set('sets', '3'); set('add', '5');
    await pick('max');
    expect([num('sets'), num('add')]).toEqual(['5', '5']);
    expect($('#toast').textContent).toBe('Max Hangs is back to its recommended settings');
  });

  it('remembers tweaks while you stay on it, e.g. when the app is opened again', async () => {
    set('sets', '3');
    await openApp(null, JSON.parse(JSON.stringify(S.state.settings))); // opened again with the saved settings
    expect(num('sets')).toBe('3');
  });

  it('Min Edge keeps your edge (that’s how it gets harder)', async () => {
    await pick('min');
    set('edge', '11'); set('sets', '8');
    await pick('max');
    await pick('min');
    expect([num('edge'), num('sets')]).toEqual(['11', '5']);
  });

  it('coming back after a warm-up keeps the settings you’d set up', async () => {
    set('sets', '3');
    $('#start').click(); await flush();
    sheetButtons().find(b => b.textContent === 'Warm up first')!.click(); await flush();
    expect($('#protoName').textContent).toBe('Warm-up');
    $('#start').click(); await flush();
    sec(300);
    $('#saveSess').click(); await flush();
    expect($('#protoName').textContent).toBe('Max Hangs');
    expect(num('sets')).toBe('3');
  });
});

describe('fixes from the pre-release review', () => {
  const pick = async (k: string) => { $('#protoBtn').click(); await flush(); document.querySelector<HTMLElement>(`.protoopt[data-k="${k}"]`)!.click(); await flush(); };
  const set = (k: string, v: string) => { const i = $<HTMLInputElement>(`#i-${k}`); i.value = v; i.dispatchEvent(new Event('change', { bubbles: true })); };

  it('a custom exercise made in the builder can be picked on the Hang page straight away', async () => {
    const w = W.cloneWorkout(S.state.settings.workouts[0]!);
    const added = WP.addExercise(w);
    await flush();
    document.querySelector<HTMLElement>('.protoopt[data-k="__new"]')!.click(); await flush();
    document.querySelector<HTMLInputElement>('.modal input')!.value = 'Long 25mm';
    sheetButtons()[1]!.click(); await flush();   // name it
    sheetButtons()[1]!.click(); await flush();   // Done
    expect(await added).toBe(true);
    const k = Object.keys(S.state.settings.customProtos)[0]!;
    await pick(k);
    expect($('#protoName').textContent).toContain('Long 25mm');
    expect(S.state.settings.vals['']).toBeUndefined();
  });

  it('your own protocols keep the settings you last used when picked again', async () => {
    const k = WP.createCustomProto('Mine', W.protoValues(P.max!));
    await pick(k);
    set('sets', '9'); set('hang', '15');
    await pick('max');
    await pick(k);
    expect([$<HTMLInputElement>('#i-sets').value, $<HTMLInputElement>('#i-hang').value]).toEqual(['9', '15']);
  });

  it('an exercise with no grip of its own still has none after it’s run', async () => {
    const lib = S.state.settings.workouts[0]!;
    expect(lib.blocks[0]!.grip).toBeUndefined();
    const before = lib.updatedAt;
    await hang.beginWorkout(W.cloneWorkout(lib));
    expect(S.state.settings.workouts[0]!.blocks[0]!.grip).toBeUndefined();
    expect(S.state.settings.workouts[0]!.updatedAt).toBe(before);
  });

  it('a session the server already had isn’t listed twice', async () => {
    await hang.beginWorkout(W.cloneWorkout(S.state.settings.workouts[0]!));
    sec(10.2);
    const b = JSON.parse(localStorage.getItem('bf.wip')!), id = b.done[0].s.id;
    await openApp(S.state.settings.workouts);
    S.state.sessions = [{ ...b.done[0].s, id, userId: 'u1' } as Session]; // it reached the server before the app closed
    sec(1);
    sheetButtons()[1]!.click(); await flush(); // Review and save
    $('#saveSess').click(); await flush();
    expect(S.state.sessions.filter(x => x.id === id)).toHaveLength(1);
  });
});

describe('page tours', () => {
  // jsdom has no layout: treat anything not inside a hidden section as on screen
  const realRects = Element.prototype.getClientRects;
  beforeEach(() => { Element.prototype.getClientRects = function (this: Element) { return (this.closest('.hide') ? [] : [{}]) as any; }; });
  afterEach(() => { Element.prototype.getClientRects = realRects; });
  const titles = async (page: string) => {
    const tour = await import('../src/views/tour');
    tour.pageTour(page);
    const out: string[] = [];
    for (let i = 0; i < 20 && document.querySelector('.tour'); i++) {
      out.push(document.querySelector('.tour-card b')!.textContent!);
      document.querySelector<HTMLElement>('.tour [data-t="next"]')!.click();
    }
    return out;
  };

  it('someone who saw the Hang tour before gets just the new tips, once', async () => {
    S.state.settings.toursSeen = { welcome: true, hang: true };
    expect(await titles('hang')).toEqual(['One protocol or a workout', 'Tweak the numbers']);
    expect(await titles('hang')).toEqual([]);
  });

  it('a new tip waits until its section is showing', async () => {
    S.state.settings.toursSeen = { welcome: true, hang: true, 'hang.workouts': true, 'hang.presets': true };
    expect(await titles('hang')).toEqual([]); // single session: the workout card isn't showing
    $('#hangMode [data-m="workout"]').click();
    expect(await titles('hang')).toEqual(['Your workout']);
  });

  it('a first visit gets the whole tour, and it isn’t repeated', async () => {
    S.state.settings.toursSeen = { welcome: true };
    const first = await titles('hang');
    expect(first[0]).toBe('One protocol or a workout');
    expect(first).toContain('Tweak the numbers');
    expect(first).toContain('Start hanging');
    expect(await titles('hang')).toEqual([]);
  });
});

describe('custom exercise from the single-session protocol list', () => {
  it('is first in the list and looks the same as in “Add an exercise”', async () => {
    $('#protoBtn').click(); await flush();
    const hangFirst = document.querySelector('.modal .protolist .protoopt')!;
    const hangHtml = hangFirst.outerHTML;
    expect(hangFirst.getAttribute('data-k')).toBe('__new');
    expect(document.querySelector('.modal .protolist')!.classList.contains('full')).toBe(true);
    expect(document.querySelector('.modal .sheet > .row')).toBeNull(); // no buttons at the bottom: a ✕ at the top
    document.querySelector<HTMLElement>('.modal .sheet-x')!.click(); await flush();
    const adding = WP.addExercise(W.cloneWorkout(S.state.settings.workouts[0]!));
    await flush();
    expect(document.querySelector('.modal .protolist .protoopt')!.outerHTML).toBe(hangHtml);
    document.querySelector<HTMLElement>('.modal .sheet-x')!.click(); await adding;
  });

  it('names it, then sets its numbers starting from what’s on screen, and selects it', async () => {
    const i = $<HTMLInputElement>('#i-sets'); i.value = '3'; i.dispatchEvent(new Event('change', { bubbles: true }));
    $('#protoBtn').click(); await flush();
    document.querySelector<HTMLElement>('.protoopt[data-k="__new"]')!.click(); await flush();
    document.querySelector<HTMLInputElement>('.modal input')!.value = 'My max';
    sheetButtons()[1]!.click(); await flush();   // name it
    expect(document.querySelector<HTMLInputElement>('.modal [data-pi="sets"]')!.value).toBe('3'); // from the Hang page
    const hang = document.querySelector<HTMLInputElement>('.modal [data-pi="hang"]')!; hang.value = '12';
    sheetButtons()[1]!.click(); await flush();   // Done
    expect($('#protoName').textContent).toBe('★ My max');
    expect([$<HTMLInputElement>('#i-sets').value, $<HTMLInputElement>('#i-hang').value]).toEqual(['3', '12']);
    const k = Object.keys(S.state.settings.customProtos)[0]!;
    expect(S.state.settings.customProtos[k]).toMatchObject({ n: 'My max', sets: 3, hang: 12 });
  });

  it('cancelling the editor keeps nothing and stays on the protocol you had', async () => {
    $('#protoBtn').click(); await flush();
    document.querySelector<HTMLElement>('.protoopt[data-k="__new"]')!.click(); await flush();
    document.querySelector<HTMLInputElement>('.modal input')!.value = 'Nope';
    sheetButtons()[1]!.click(); await flush();
    sheetButtons()[0]!.click(); await flush();   // Cancel
    expect(Object.keys(S.state.settings.customProtos)).toEqual([]);
    expect($('#protoName').textContent).toBe('Max Hangs');
  });
});

