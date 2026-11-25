// The finish-screen parade: which birds come out, and how they jump out, walk, wink, fly about, peck and leave.
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { Parade, PARADE_MAX, STAY, type Marcher, type Perch, type Frame } from '../src/aviary/parade';
import { drawBird, restPose } from '../src/aviary/rig';
import { SPECIES } from '../src/aviary/species';
import { HATS, hatOf } from '../src/aviary/hats';
import { setHats, chooseBird, BANDS, weekIndex } from '../src/lib/flock';
import { state } from '../src/lib/state';
import { marchers } from '../src/views/parade';
import type { Profile } from '../src/lib/types';
import { sessionAt } from './helpers';

/** A stand-in 2D context (jsdom has no canvas) that remembers every colour it was asked to fill with. */
function recorder() {
  const fills: unknown[] = [], strokes: unknown[] = [], halos: string[] = [];
  const noop = () => ({ addColorStop(_: number, col: string) { halos.push(col); } });
  const c = new Proxy({} as Record<string | symbol, unknown>, {
    get: (t, k) => (k in t ? t[k] : noop),
    set: (t, k, v) => { if (k === 'fillStyle') fills.push(v); if (k === 'strokeStyle') strokes.push(v); t[k] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { c, fills, strokes, halos };
}
beforeAll(() => { (globalThis as any).Path2D ??= class { moveTo() {} lineTo() {} quadraticCurveTo() {} bezierCurveTo() {} closePath() {} }; });

const bird = (id: keyof typeof SPECIES, fresh = false): Marcher => ({ sp: SPECIES[id], lk: SPECIES[id].look, band: '#3ddc84', fresh });
/** The same "random" choices every run. */
const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const W = 390, H = 750;
/** A finish screen's things to stand on: the mountain's peak, the headline, a card, the three stat boxes with the
 *  points inside the last, Save. */
const PAGE: Perch[] = [
  { id: 'peak0', x0: 195, x1: 195, y: 120 }, { id: 'cheer0', x0: 60, x1: 330, y: 190 }, { id: 'card0', x0: 30, x1: 360, y: 260 },
  { id: 'stat0', x0: 30, x1: 120, y: 330 }, { id: 'stat1', x0: 150, x1: 240, y: 330 }, { id: 'stat2', x0: 270, x1: 360, y: 330 },
  { id: 'pts0', x0: 280, x1: 330, y: 346 }, { id: 'save', x0: 40, x1: 350, y: 640 },
];
/** A new currawong and three more. */
const line = (seed = 7) => new Parade([bird('currawong', true), bird('currawong'), bird('currawong'), bird('currawong')], W, H, seeded(seed));
/** Run it for `secs`, a 60th of a second at a time, calling `each` with every bird after each step. */
function run(p: Parade, secs: number, page: Perch[] | null = PAGE, each?: (fs: (Frame | null)[]) => void) {
  for (let j = 0, n = Math.round(secs * 60); j < n; j++) { p.step(1 / 60, page); each?.(p.birds.map((_, i) => p.frame(i))); }
}

describe('the parade', () => {
  it('brings each bird up from behind the tab bar, new ones first and highest, onto the bar just in from the left', () => {
    const p = line(), first: (Frame | null)[] = [], top = [0, 0, 0, 0], landX: number[] = [], burst = [-1, -1, -1, -1];
    run(p, 6, PAGE, fs => fs.forEach((f, i) => {
      if (!f || f.act !== 'out') return;
      first[i] ??= f;
      top[i] = Math.max(top[i]!, (p.ground - f.y) / f.k);
      if (f.y === p.ground) { landX[i] ??= f.x; burst[i] = Math.max(burst[i]!, f.burst); }
    }));
    for (let i = 0; i < 4; i++) {
      expect(first[i]!.y - p.ground, `bird ${i}`).toBeGreaterThan(100 * first[i]!.k); // out of sight to start with
      expect(landX[i]).toBeGreaterThanOrEqual(p.x0 - 1e-6); expect(landX[i]).toBeLessThan(p.x0 + p.v / 60 + 1e-6);
    }
    expect(p.x0).toBeLessThan(W / 4);
    expect(top[0]).toBeGreaterThan(top[1]! * 1.4); // the new bird jumps highest…
    expect(burst[0]).toBeGreaterThan(0); expect(burst[1]).toBe(-1); // …and lands in a burst of colour
  });

  it('walks them along the bar in a line that never bunches up, each winking once as it passes the middle', () => {
    const p = line(), winks = [0, 0, 0, 0], where: number[] = [], was = [false, false, false, false];
    run(p, 12, PAGE, fs => {
      const on = fs.filter(f => f && f.act === 'out' && f.y === p.ground) as Frame[];
      for (let j = 1; j < on.length; j++) expect(on[j - 1]!.x - on[j]!.x).toBeGreaterThanOrEqual(100 * p.k);
      fs.forEach((f, i) => { const shut = !!f && f.wink > 0.4; if (shut && !was[i]) { winks[i]++; where[i] = f!.x; } was[i] = shut; });
    });
    expect(winks).toEqual([1, 1, 1, 1]);
    for (const x of where) { expect(x).toBeGreaterThan(W * 0.35); expect(x).toBeLessThan(W * 0.7); }
  });

  it('then flies up onto things on the page and pecks at them, never crowding each other', () => {
    const p = line(), landings: string[][] = [[], [], [], []], head = [0, 0, 0, 0], gap = 70 * p.k, tall = 45 * p.k;
    let prev: (Frame | null)[] = [];
    run(p, 45, PAGE, fs => {
      fs.forEach((f, i) => {
        if (f && prev[i]?.act === 'fly' && f.act !== 'fly') { landings[i]!.push(f.on!); expect(f.act).toBe('peck'); } // lands, and has a peck
        if (f?.act === 'peck') head[i] = Math.min(head[i]!, f.pose.hAng);
      });
      const standing = fs.filter(f => f && (f.act === 'peck' || f.act === 'look')) as Frame[];
      for (const a of standing) for (const b of standing) if (a !== b) expect(Math.abs(a.x - b.x) >= gap - 0.5 || Math.abs(a.y - b.y) >= tall - 0.5).toBe(true); // on one thing, or one just above another
      prev = fs;
    });
    for (const l of landings) { expect(l.length).toBeGreaterThanOrEqual(3); expect(l[0]).not.toBe('ground'); } // off the bar while the line's still coming
    expect(new Set(landings.flat()).size).toBeGreaterThanOrEqual(5);
    for (const h of head) expect(h).toBeLessThan(-0.9); // head right down
  });

  it('moves with what it’s standing on as the page scrolls, and takes off when it goes', () => {
    const p = line();
    let page = PAGE, i = -1;
    for (let n = 0; n < 60 * 60 && i < 0; n++) { p.step(1 / 60, page); i = p.birds.findIndex((_, j) => p.frame(j)?.on === 'card0' && p.frame(j)?.act === 'peck'); }
    expect(i).toBeGreaterThanOrEqual(0);
    const before = p.frame(i)!;
    page = PAGE.map(x => (x.id === 'card0' ? { ...x, x0: x.x0 + 10, x1: x.x1 + 10, y: x.y - 50 } : x));
    p.step(1 / 60, page);
    expect(p.frame(i)!.y).toBeCloseTo(before.y - 50); expect(p.frame(i)!.x).toBeCloseTo(before.x + 10);
    p.step(1 / 60, page.filter(x => x.id !== 'card0'));
    expect(p.frame(i)!.act).toBe('fly');
  });

  it('stays until you leave the finish screen, then they all fly off', () => {
    const p = line();
    run(p, 60);
    expect(p.done).toBe(false); expect(p.birds.every((_, i) => p.frame(i))).toBe(true);
    let n = 0;
    while (!p.done && n++ < 600) p.step(1 / 60, null);
    expect(n).toBeLessThan(5 * 60);
    // left straight away: the ones still to come out never do
    const q = line(); let seen = false;
    run(q, 0.5);
    run(q, 10, null, fs => { seen ||= !!fs[3]; });
    expect(q.done).toBe(true); expect(seen).toBe(false);
  });

  it('flies off on its own after a couple of minutes', () => {
    const p = line();
    run(p, STAY + 6);
    expect(p.done).toBe(true);
  });

  it('walks off the end of the bar when there’s nothing on the page to stand on', () => {
    const p = line(); let flew = false;
    run(p, 20, [], fs => { flew ||= fs.some(f => f?.act === 'fly'); });
    expect(p.done).toBe(true); expect(flew).toBe(false);
  });

  it('spaces a mix of birds for the biggest, and hoppers hop', () => {
    const mix = new Parade([bird('blackcockatoo'), bird('rosella'), bird('galah')], W, H, seeded(3));
    expect(mix.v * mix.s).toBeGreaterThanOrEqual(100 * mix.k * SPECIES.blackcockatoo.size);
    let lift = 0;
    run(mix, 5, [], fs => { const f = fs[1]; if (f?.act === 'out' && f.y === mix.ground) lift = Math.max(lift, f.pose.lift); });
    expect(lift).toBeGreaterThan(SPECIES.rosella.leg * 0.8);
  });

  it('draws the birds, with a halo behind each one in the page’s colour, and chips flying when they peck', () => {
    const p = line();
    run(p, p.landing(1) + 0.2); // two out on the bar, the third still behind it
    const r = recorder();
    p.draw(r.c, '#eef2f6');
    expect(r.strokes.filter(f => f === '#3ddc84')).toHaveLength(2); // their leg bands
    expect(r.halos.filter(h => h === 'rgba(238,242,246,0.13)')).toHaveLength(2);
    const plain = recorder(); p.draw(plain.c);
    expect(plain.halos.filter(h => h.startsWith('rgba(238'))).toHaveLength(0);
    let chips = false;
    run(p, 30, PAGE, () => { const c = recorder(); p.draw(c.c, '#eef2f6'); chips ||= c.fills.includes('rgba(238,242,246,0.75)'); });
    expect(chips).toBe(true);
  });
});

describe('the wink', () => {
  it('shuts the eye and puts a twinkle by it', () => {
    const sp = SPECIES.galah, open = recorder(), wink = recorder();
    drawBird(open.c, sp, sp.look, restPose(sp), { band: '#ff5a4e' });
    drawBird(wink.c, sp, sp.look, restPose(sp), { band: '#ff5a4e', wink: 1 });
    expect(open.fills).toContain(sp.look.iris); expect(open.fills).not.toContain('#fff6cf');
    expect(wink.fills).not.toContain(sp.look.iris); expect(wink.fills).toContain('#fff6cf');
  });
});

describe('which birds walk', () => {
  const prof = (id: string, joined: string): Profile => ({ id, name: id.toUpperCase(), avatarUrl: null, isAdmin: false, createdAt: joined });
  const NOW = new Date(2026, 10, 24, 12); // a currawong week
  const now = NOW.toISOString();
  const setup = (points: number[]) => {
    state.me = prof('ada', '2026-01-01T00:00:00Z');
    state.profiles = new Map([state.me, prof('bo', '2026-02-01T00:00:00Z')].map(x => [x.id, x]));
    state.sessions = [...points.map((pts, j) => sessionAt(2026, 11, 23, 8 + j, { userId: 'ada', points: pts })), sessionAt(2026, 11, 23, 9, { userId: 'bo', points: 300 })];
  };
  afterEach(() => { state.me = null; state.sessions = []; state.profiles = new Map(); setHats(false); chooseBird(null); });

  it('brings out all your birds this week, the ones this session earned first', () => {
    setup([50, 45]); // 95 points: 3 birds
    const m = marchers([{ points: 40, createdAt: now }], NOW); // 135: a 4th
    expect(m.map(b => b.fresh)).toEqual([true, false, false, false]);
    expect(m.every(b => b.sp.id === 'currawong' && b.band === BANDS[0])).toBe(true);
    expect(m.every(b => !b.hat)).toBe(true); // hats are off
  });

  it('wears the same hats as in the clearing, when hats are on', () => {
    setup([95]); setHats(true);
    const m = marchers([{ points: 40, createdAt: now }], NOW), week = weekIndex(NOW);
    expect(m.map(b => b.hat)).toEqual([3, 0, 1, 2].map(i => hatOf('ada', i, week)));
    expect(m.every(b => HATS.includes(b.hat!))).toBe(true);
  });

  it('shows the birds you already had when a session earns no new one, and nothing with no birds yet', () => {
    setup([95]);
    expect(marchers([{ points: 10, createdAt: now }], NOW).map(b => b.fresh)).toEqual([false, false, false]);
    setup([10]);
    expect(marchers([{ points: 10, createdAt: now }], NOW)).toEqual([]);
    state.me = null;
    expect(marchers([{ points: 300, createdAt: now }], NOW)).toEqual([]);
  });

  it('counts every session of a workout, and walks at most a dozen', () => {
    setup([300]); // 10 birds
    const m = marchers([{ points: 60, createdAt: now }, { points: 45, createdAt: now }], NOW); // 405: 13 birds
    expect(m).toHaveLength(PARADE_MAX);
    expect(m.filter(b => b.fresh)).toHaveLength(3);
    expect(m.slice(0, 3).every(b => b.fresh)).toBe(true);
  });

  it('mixes the species in the all-birds week, and follows an admin’s pick', () => {
    setup([300]); chooseBird('all');
    expect(new Set(marchers([], NOW).map(b => b.sp.id)).size).toBe(10);
    chooseBird('magpie');
    expect(marchers([], NOW).every(b => b.sp.id === 'magpie')).toBe(true);
  });
});
