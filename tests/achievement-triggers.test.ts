// Every achievement is earned when its condition is met (and not just before), and the ones earned by doing
// something in the app (secrets mid-session, accent colours, the leaderboard, boards) really are earned there.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TIERED, ONE_OFFS, earned, shownTier, hasOneOff, keyOf, recheckSeen, newUnlocks, type Ctx } from '../src/lib/achievements';
import { ctx, hang, session, sessionAt } from './helpers';
import type { Session } from '../src/lib/types';

vi.mock('../src/main', () => ({ go: vi.fn(async () => true), ACCENTS: ['#8fb3d1', '#3ddc84'], applyTheme() {}, refreshHeader() {}, rerender: async () => {} }));

const NOW = new Date(2026, 10, 23, 12); // Mon 23 Nov 2026, midday
const n = <T = Session>(k: number, f: (i: number) => T): T[] => Array.from({ length: k }, (_, i) => f(i));
const hangsOf = (k: number, over: Parameters<typeof hang>[0] = {}) => n(k, i => hang({ set: i + 1, ...over }));
/** Two training days a week for `weeks` weeks, ending last week. */
const weeksOf = (weeks: number) => n(weeks, w => w).flatMap(w => [sessionAt(2026, 11, 17 - 7 * w, 12), sessionAt(2026, 11, 19 - 7 * w, 12)]); // Tue and Thu

/** For each achievement: a situation that just meets it, and one that just misses. */
const CASES: Record<string, [meets: Partial<Ctx>, misses: Partial<Ctx>]> = {
  // tiered: reaching the first tier
  'Sessions': [{ sessions: [session()] }, { sessions: [] }],
  'Week streak': [{ sessions: weeksOf(1) }, { sessions: [sessionAt(2026, 11, 17)] }],
  'Total hangs': [{ sessions: [session({ totalHangs: 10 })] }, { sessions: [session({ totalHangs: 9 })] }],
  'Added weight': [{ sessions: n(3, () => session({ hang: 10, addedKg: 2.5, fullHangs: 1 })) }, { sessions: [...n(2, () => session({ hang: 10, addedKg: 2.5, fullHangs: 1 })),
    ...n(3, () => session({ hang: 10, addedKg: 60, edgeMm: 35, fullHangs: 1 })), ...n(3, () => session({ hang: 10, addedKg: 5, hands: 'L', fullHangs: 1 }))] }], // jugs and one-arm hangs aren't the standard
  'Smallest edge': [{ sessions: n(3, () => session({ edgeMm: 25, assistKg: 0, fullHangs: 1 })) }, { sessions: [...n(3, () => session({ edgeMm: 26, assistKg: 0, fullHangs: 1 })),
    ...n(3, () => session({ edgeMm: 5, assistKg: 0, hang: 3, fullHangs: 1 }))] }], // a 3-second touch of a tiny edge isn't 5s+
  'Longest hang': [{ sessions: n(3, () => session({ hangs: hangsOf(1, { held: 10 }) })) }, { sessions: [...n(3, () => session({ hangs: hangsOf(1, { held: 9, full: false }) })), ...n(3, () => session({ mode: 'lift', hangs: hangsOf(1, { held: 180, target: 180 }) })),
    ...n(3, () => session({ assistKg: 30, hangs: hangsOf(1, { held: 180, target: 180 }) }))] }], // nor is a lift, or an assisted hang, held for ages
  'Abrahang days': [{ sessions: [session({ protocolKey: 'abra', tutS: 15 })] }, { sessions: [session({ protocolKey: 'abra', tutS: 14 })] }],
  'Crimp sessions': [{ sessions: [session({ grip: 'Full crimp' })] }, { sessions: [session({ grip: 'Open' })] }],
  'Open-hand sessions': [{ sessions: [session({ grip: 'Open' })] }, { sessions: [session({ grip: 'Drag' })] }],
  'Drag sessions': [{ sessions: [session({ grip: 'Drag' })] }, { sessions: [session({ grip: 'Open' })] }],
  'Pinch sessions': [{ sessions: [session({ grip: 'Pinch' })] }, { sessions: [session({ grip: 'Sloper' })] }],
  'Sloper sessions': [{ sessions: [session({ grip: 'Sloper' })] }, { sessions: [session({ grip: 'Pinch' })] }],
  'One-arm hangs': [{ sessions: [session({ hangs: [hang({ hand: 'L' })] })] }, { sessions: [session({ hangs: [hang({ hand: 'L', held: 5, full: false })] }), session({ mode: 'lift', hands: 'L', hangs: hangsOf(10, { hand: 'L' }) })] }], // one-arm lifts don't count
  'No-hang lift': [{ sessions: n(3, () => session({ mode: 'lift', liftKg: 10, fullHangs: 1 })) }, { sessions: n(3, () => session({ mode: 'lift', liftKg: 9.5, fullHangs: 1 })) }],
  'Time on the board': [{ sessions: [session({ tutS: 300 })] }, { sessions: [session({ tutS: 299 })] }],
  'Training days': [{ sessions: [session({ tutS: 15 })] }, { sessions: [session({ tutS: 14 })] }],
  'Seasons won': [{ seasonsWon: 1 }, { seasonsWon: 0 }],
  'Points': [{ pointsTotal: 50 }, { pointsTotal: 49 }],
  // one-offs
  'First Hang': [{ sessions: [session()] }, {}],
  'Say Cheese': [{ hasAvatar: true }, {}],
  'Board Collector': [{ customBoards: 1 }, {}],
  'Mad Scientist': [{ customProtocols: 1 }, {}],
  'Dawn Patrol': [{ sessions: [sessionAt(2026, 11, 20, 4)] }, { sessions: [sessionAt(2026, 11, 20, 6)] }],
  'Night Owl': [{ sessions: [sessionAt(2026, 11, 20, 23)] }, { sessions: [sessionAt(2026, 11, 20, 22)] }],
  'Perfect Session': [{ sessions: [session({ protocolKey: 'max', fullHangs: 5, totalHangs: 5 })] }, { sessions: [session({ protocolKey: 'max', fullHangs: 4, totalHangs: 5 })] }],
  'Ambidextrous': [{ sessions: [session({ hands: 'LR', hangs: [hang({ hand: 'L', held: 20 }), hang({ hand: 'R', held: 19 })] })] }, { sessions: [session({ hands: 'LR', hangs: [hang({ hand: 'L', held: 20 }), hang({ hand: 'R', held: 18 })] })] }],
  'Speedrun': [{ sessions: [session({ protocolKey: 'jlmh' })] }, { sessions: [session({ protocolKey: 'max' })] }],
  'PB Machine': [{ sessions: [1, 4, 7].map(d => sessionAt(2026, 11, d, 12, { isPb: true })) }, { sessions: [1, 4, 9].map(d => sessionAt(2026, 11, d, 12, { isPb: true })) }],
  'Hype Squad': [{ commentsGiven: 10 }, { commentsGiven: 9 }],
  'Heart Throb': [{ heartsReceived: 50 }, { heartsReceived: 49 }],
  'Let It Go': [{ sessions: [session({ hangs: hangsOf(5, { held: 3, full: false }) })] }, { sessions: [session({ hangs: hangsOf(4, { held: 3, full: false }) })] }],
  'Feelings Valid': [{ sessions: [session({ feel: '😭' })] }, { sessions: [session({ feel: '😫' })] }],
  'Dramatic Exit': [{ flags: { dramaticExit: true } }, {}],
  'Ho Ho Hang': [{ sessions: [sessionAt(2026, 12, 25, 10)] }, { sessions: [sessionAt(2026, 12, 24, 10)] }],
  'Leap Hang': [{ sessions: [sessionAt(2028, 2, 29, 10)] }, { sessions: [sessionAt(2028, 3, 1, 10)] }],
  '3am Thoughts': [{ sessions: [sessionAt(2026, 11, 20, 3)] }, { sessions: [sessionAt(2026, 11, 20, 4)] }],
  'Groundhog Day': [{ sessions: n(7, i => sessionAt(2026, 11, 10 + i, 12, { protocolKey: 'abra' })) }, { sessions: n(6, i => sessionAt(2026, 11, 10 + i, 12, { protocolKey: 'abra' })) }],
  'Slow Burn': [{ flags: { slowBurn: true } }, {}],
  'Nice.': [{ sessions: [session({ tutS: 69 })] }, { sessions: [session({ tutS: 70 })] }],
  'Spin Cycle': [{ flags: { spinCycle: true } }, {}],
  'Peeping Tom': [{ flags: { peepingTom: true } }, {}],
  'Chalk Bucket': [{ flags: { chalkBucket: true } }, {}],
};

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); });
afterEach(() => { vi.useRealTimers(); });

describe('every achievement is earned when its condition is met', () => {
  it('has a case here (a new achievement needs one)', () => {
    expect(Object.keys(CASES).sort()).toEqual([...TIERED, ...ONE_OFFS].map(a => a.name).sort());
  });
  for (const a of TIERED) it(`${a.name}: reaches the first tier`, () => {
    const [yes, no] = CASES[a.name]!;
    expect(earned(ctx(yes))[keyOf(a)]).toBe(1);
    expect(earned(ctx(no))[keyOf(a)]).toBeUndefined();
  });
  for (const o of ONE_OFFS) it(`${o.name}`, () => {
    const [yes, no] = CASES[o.name]!;
    expect(earned(ctx(yes))[`o:${o.name}`]).toBe(1);
    expect(earned(ctx(no))[`o:${o.name}`]).toBeUndefined();
  });
  it('every tier of every badge can be reached', () => {
    // the top threshold reached means every tier below it was too
    const top: Record<string, Partial<Ctx>> = {
      'Sessions': { sessions: n(1000, () => session()) },
      'Week streak': { sessions: weeksOf(104) },
      'Total hangs': { sessions: [session({ totalHangs: 25000 })] },
      'Added weight': { sessions: n(3, () => session({ hang: 10, addedKg: 60, fullHangs: 1 })) },
      'Smallest edge': { sessions: n(3, () => session({ edgeMm: 5, assistKg: 0, fullHangs: 1 })) },
      'Longest hang': { sessions: n(3, () => session({ hangs: hangsOf(1, { held: 180, target: 180 }) })) },
      'Abrahang days': { sessions: n(365, i => session({ protocolKey: 'abra', createdAt: new Date(+NOW - i * 864e5).toISOString() })) },
      'Crimp sessions': { sessions: n(300, () => session({ grip: 'Half crimp' })) },
      'Open-hand sessions': { sessions: n(300, () => session({ grip: 'Open' })) },
      'Drag sessions': { sessions: n(300, () => session({ grip: 'Drag' })) },
      'Pinch sessions': { sessions: n(300, () => session({ grip: 'Pinch' })) },
      'Sloper sessions': { sessions: n(300, () => session({ grip: 'Sloper' })) },
      'One-arm hangs': { sessions: [session({ hangs: hangsOf(600, { hand: 'R' }) })] },
      'No-hang lift': { sessions: n(3, () => session({ mode: 'lift', liftKg: 100, fullHangs: 1 })) },
      'Time on the board': { sessions: [session({ tutS: 300000 })] },
      'Training days': { sessions: n(365, i => session({ createdAt: new Date(+NOW - i * 864e5).toISOString() })) },
      'Seasons won': { seasonsWon: 20 },
      'Points': { pointsTotal: 100000 },
    };
    for (const a of TIERED) expect(earned(ctx(top[a.name]))[keyOf(a)], a.name).toBe(10);
  });
});

describe('a badge whose rule was tightened (lifts no longer count as hangs)', () => {
  const onearm = TIERED.find(x => x.name === 'One-arm hangs')!, k = keyOf(onearm);
  it('drops tiers that only lifts earned, without popping up again what hangs earned', () => {
    // Silver (10) was shown, but 8 of those 10 one-arm "hangs" were lifts: really Bronze (2)
    const seen: Record<string, number> = { 't:One-arm hangs': 3 }, now = { [k]: 2 };
    expect(recheckSeen(seen, now)).toBe(true);
    expect(seen[k]).toBe(2);
    expect(seen['t:One-arm hangs']).toBe(3); // left for phones still on the old version
    expect(newUnlocks(seen, now)).toEqual([]);
    expect(shownTier(onearm, ctx({ sessions: [session({ hangs: hangsOf(5, { hand: 'L' }) })] }), seen)).toBe(2);
    expect(recheckSeen(seen, now)).toBe(false); // once
  });
  it('a tier earned with hangs after the change still pops up', () => {
    const seen: Record<string, number> = { 't:One-arm hangs': 1 }, now = { [k]: 3 };
    recheckSeen(seen, now);
    expect(newUnlocks(seen, now).map(u => `${u.name} ${u.tier}`)).toEqual(['One-arm hangs Silver']);
  });
  it('never earned before: nothing to carry over', () => {
    const seen: Record<string, number> = {};
    expect(recheckSeen(seen, { [k]: 1 })).toBe(false);
    expect(newUnlocks(seen, { [k]: 1 })).toHaveLength(1);
  });
});

describe('earned badges stay earned', () => {
  it('Mad Scientist stays after the custom protocol is deleted; a tier never drops', () => {
    const o = ONE_OFFS.find(x => x.name === 'Mad Scientist')!, streak = TIERED.find(x => x.name === 'Week streak')!;
    const seen = earned(ctx({ customProtocols: 1, sessions: weeksOf(4) }));
    expect(hasOneOff(o, ctx({ customProtocols: 0 }), seen)).toBe(true);
    expect(shownTier(streak, ctx({ sessions: [] }), seen)).toBe(3); // Silver: a 4-week streak
    expect(hasOneOff(o, ctx({ customProtocols: 0 }), {})).toBe(false);
  });
});

// ---------- earned by doing things in the app ----------
describe('earned in the app', () => {
  let S: typeof import('../src/lib/state');
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
  const sheetButtons = () => [...document.querySelectorAll<HTMLButtonElement>('.modal .sheet > .row button')];
  const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);
  const flags = () => S.state.settings.flags;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance', 'Date'] });
    vi.setSystemTime(NOW);
    window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as any;
    window.scrollTo = (() => {}) as any;
    Element.prototype.scrollIntoView = () => {};
    localStorage.clear();
    document.body.innerHTML = '<div id="view-hang"></div><div id="view-profile"></div><div id="view-ranks"></div>';
    vi.resetModules();
    S = await import('../src/lib/state');
    const saved: Session[] = [];
    S.state.store = { kind: 'local', currentUserId: () => 'u1', savePrivate: async () => {}, addSession: async (x: any) => { const s = { ...x, userId: 'u1' }; saved.push(s); return s; } } as any;
    S.state.me = { id: 'u1', name: 'Tess', avatarUrl: null, isAdmin: false, createdAt: '2026-01-01T00:00:00Z' };
    S.state.profiles = new Map([['u1', S.state.me]]);
    S.state.priv = { bodyweightKg: 70, settings: {} };
    S.state.sessions = [];
    S.state.settings = S.DEFAULT_SETTINGS();
    Object.assign(S.state.settings.prefs, { ready: 5, warmup: false, nudges: false });
    S.state.loaded = true;
    const { checkUnlocks } = await import('../src/views/unlocks');
    checkUnlocks(0); await tick(10); // the first check notes what's already earned (nothing)
  });
  const openHang = async () => { const h = await import('../src/views/hang'); h.renderHang($('#view-hang')); return h; };
  const popped = async () => { await tick(400); return $('.unlock')?.getAttribute('aria-label') ?? ''; };

  it('Chalk Bucket: tapping “Chalk up” 10 times during get-ready', async () => {
    await openHang();
    $('#start').click(); await tick(100);
    expect($('#setlbl').textContent).toContain('Chalk up');
    for (let i = 0; i < 9; i++) $('#setlbl').click();
    expect(flags().chalkBucket).toBeFalsy();
    $('#setlbl').click();
    expect(flags().chalkBucket).toBe(true);
    expect(await popped()).toContain('Chalk Bucket');
  });

  it('Dramatic Exit: Cancel within 10s of starting, even if choosing Give up takes longer', async () => {
    await openHang();
    $('#start').click(); await tick(4000);
    $('#quit').click(); await tick(100);
    await tick(9000); // reading the sheet
    sheetButtons().find(b => /Give up/.test(b.textContent!))!.click(); await tick(100);
    expect(flags().dramaticExit).toBe(true);
    expect(await popped()).toContain('Dramatic Exit');
  });
  it('Dramatic Exit: not after 10 seconds', async () => {
    await openHang();
    $('#start').click(); await tick(11000);
    $('#quit').click(); await tick(100);
    sheetButtons().find(b => /Give up/.test(b.textContent!))!.click(); await tick(100);
    expect(flags().dramaticExit).toBeFalsy();
  });

  const pauseHalfAnHour = () => vi.setSystemTime(Date.now() + 31 * 60e3);
  it('Slow Burn: paused 30+ minutes, then Resume', async () => {
    await openHang();
    $('#start').click(); await tick(2000);
    $('#pause').click(); pauseHalfAnHour(); $('#pause').click();
    expect(flags().slowBurn).toBe(true);
    expect(await popped()).toContain('Slow Burn');
  });
  it('Slow Burn: paused 30+ minutes, then Cancel → Hang in there', async () => {
    await openHang();
    $('#start').click(); await tick(2000);
    $('#pause').click(); pauseHalfAnHour();
    $('#quit').click(); await tick(100);
    sheetButtons().find(b => /Hang in there/.test(b.textContent!))!.click(); await tick(100);
    expect(flags().slowBurn).toBe(true);
  });
  it('Slow Burn: 30+ minutes in Edit, then Resume with changes', async () => {
    await openHang();
    $('#start').click(); await tick(2000);
    $('#edit').click(); pauseHalfAnHour();
    $('#start').click(); await tick(100);
    expect(flags().slowBurn).toBe(true);
  });
  it('Slow Burn: not for a short pause', async () => {
    await openHang();
    $('#start').click(); await tick(2000);
    $('#pause').click(); vi.setSystemTime(Date.now() + 29 * 60e3); $('#pause').click();
    expect(flags().slowBurn).toBeFalsy();
  });

  it('Let It Go, Speedrun and Feelings Valid: a QUICK SESH, 😭 beforehand, letting go of every hang', async () => {
    await openHang();
    const sel = $<HTMLSelectElement>('#proto'); sel.value = 'jlmh'; sel.dispatchEvent(new Event('change'));
    for (const [k, v] of [['sets', '5'], ['rest', '5'], ['hang', '10']]) { const i = $<HTMLInputElement>(`#i-${k}`); i.value = v; i.dispatchEvent(new Event('change', { bubbles: true })); }
    $('[data-k="feel"] [data-v="😭"]').click();
    $('#start').click();
    for (let t = 0; t < 120 && $('#v-done').classList.contains('hide'); t++) {
      await tick(1000);
      if (!$('#letgo').classList.contains('hide')) { await tick(2000); $('#letgo').click(); }
    }
    expect($('#v-done').classList.contains('hide')).toBe(false);
    $('#saveSess').click(); await tick(100);
    const s = S.state.sessions[0]!;
    expect([s.protocolKey, s.feel, s.hangs.filter(h => !h.full).length]).toEqual(['jlmh', '😭', 5]);
    const got = await popped();
    for (const name of ['Let It Go', 'Speedrun', 'Feelings Valid', 'First Hang']) expect(got).toContain(name);
  });

  it('Spin Cycle: changing the accent colour 10 times in a day', async () => {
    const prof = await import('../src/views/profile');
    prof.renderProfile($('#view-profile'));
    for (let i = 0; i < 10; i++) $(`#sw [data-c="${i % 2 ? '#8fb3d1' : '#3ddc84'}"]`).click();
    expect(flags().spinCycle).toBe(true);
    expect(await popped()).toContain('Spin Cycle');
  });

  it('Board Collector: adding a board of your own', async () => {
    const prof = await import('../src/views/profile');
    prof.renderProfile($('#view-profile'));
    $<HTMLInputElement>('#newBoard').value = 'Garage board'; $('#addBoard').click(); await tick(10);
    expect(await popped()).toContain('Board Collector');
  });

  it('Mad Scientist: making a custom protocol, and it stays after deleting it', async () => {
    const WP = await import('../src/views/workout-parts');
    const k = WP.createCustomProto('Long hangs', { hang: 20, rest: 60, sets: 3, reps: 1, setRest: 120, edge: 25, add: 0, rem: 0, lift: 20, effort: 60, sw: 10, mode: 'hang', hands: 'both' } as any);
    expect(await popped()).toContain('Mad Scientist');
    delete S.state.settings.customProtos[k];
    const A = await import('../src/lib/achievements');
    expect(A.hasOneOff(A.ONE_OFFS.find(o => o.name === 'Mad Scientist')!, S.achievementCtx(), S.state.settings.achSeen)).toBe(true);
  });

  it('Peeping Tom: checking the leaderboard 20 times in a day', async () => {
    const ranks = await import('../src/views/ranks');
    for (let i = 0; i < 19; i++) ranks.renderRanks($('#view-ranks'));
    expect(flags().peepingTom).toBeFalsy();
    ranks.renderRanks($('#view-ranks'));
    expect(flags().peepingTom).toBe(true);
    expect(await popped()).toContain('Peeping Tom');
  });
});
