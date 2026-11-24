// The bird simulation runs without a canvas, so every species can be put through a long, busy stretch
// of time: seed thrown, birds startled, climbers tapped, birds leaving. Nothing may break, get stuck or wander off.
import { describe, it, expect } from 'vitest';
import { World, windPt, type Bird } from '../src/aviary/sim';
import { SPECIES } from '../src/aviary/species';
import { SPECIES_ORDER } from '../src/lib/flock';

function seeded(seed: number) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
const finite = (b: Bird) => [b.x, b.y, b.alt, b.hang, ...Object.values(b.pose)].every(v => Number.isFinite(v));

function run(w: World, secs: number, each?: (t: number) => void) {
  const dt = 1 / 30;
  for (let t = 0; t < secs; t += dt) { w.step(dt); each?.(t); }
}

describe('the clearing', () => {
  for (const id of SPECIES_ORDER) {
    it(`${id}: a busy few minutes`, () => {
      const rand = seeded(7 + id.length), w = new World(rand);
      w.resize(375, 560);
      for (let i = 0; i < 14; i++) w.add(id, `u${i % 3}`, '#f00', i < 10 ? 'place' : 'arrive');
      const acts = new Set<string>(), stuck = new Map<number, number>();
      const sounds: string[] = []; w.onSound = (_b, k) => sounds.push(k);
      let tick = 0;
      run(w, 150, t => {
        if (++tick % 210 === 0) w.tap(rand() * 375, w.top + rand() * (w.bottom - w.top)); // seed, or a startled bird
        if (tick % 330 === 0) { const b = w.birds.find(x => x.alt < 1 && x.perch < 0); if (b) w.tap(b.x, b.y - (b.sp.leg * 0.8 + b.sp.ry) * w.px(b)); } // poke one
        if (tick % 900 === 0) w.highlight('u1');
        if (tick === 2400) w.night = true;
        if (tick === 3300) w.night = false;
        for (const b of w.birds) {
          acts.add(b.act);
          expect(finite(b), `${id} ${b.act}`).toBe(true);
          expect(b.x).toBeGreaterThan(-90); expect(b.x).toBeLessThan(375 + 90);
          expect(b.alt).toBeGreaterThanOrEqual(0); expect(b.alt).toBeLessThan(560);
          if (b.alt < 1 && b.perch < 0 && !b.fl && b.act !== 'arrive') { expect(b.y).toBeGreaterThan(w.hor); expect(b.y).toBeLessThan(560 + 1); }
          const key = b.id * 1000 + b.act.length; stuck.set(key, b.at);
          if (!['perched', 'sleep', 'swim'].includes(b.act)) expect(b.at, `${id} stuck in ${b.act}`).toBeLessThan(40);
        }
      });
      expect(w.birds.length).toBe(14);
      // a decent spread of what this species gets up to
      expect(acts.size).toBeGreaterThanOrEqual(10);
      for (const a of ['arrive', 'forage', 'startle']) expect(acts.has(a), `${id} never did ${a}`).toBe(true);
      expect(sounds.length).toBeGreaterThan(0);
      // seed thrown on the ground gets eaten (or blows away) eventually
      run(w, 95);
      expect(w.food.length).toBe(0);
      // two birds leave when points go away; their perches free up
      w.remove('u0', 2);
      run(w, 15);
      expect(w.birds.length).toBe(12);
      expect(w.perches.every(p => !p.by || w.birds.includes(p.by))).toBe(true);
    });
  }

  it('wood ducks swim, galahs hang upside down, currawongs pull grubs, wattlebirds catch insects', () => {
    const seen = (id: keyof typeof SPECIES, ok: (b: Bird) => boolean, secs = 240) => {
      const w = new World(seeded(3)); w.resize(375, 560);
      for (let i = 0; i < 12; i++) w.add(id, 'u', '#f00', 'place');
      let hit = false; run(w, secs, () => { if (!hit) hit = w.birds.some(ok); });
      return hit;
    };
    expect(seen('woodduck', b => b.swim)).toBe(true);
    expect(seen('galah', b => b.hang > 0.9)).toBe(true);
    expect(seen('currawong', b => b.hold === 1)).toBe(true);
    expect(seen('wattlebird', b => b.act === 'hawk' && b.alt > 20)).toBe(true);
    expect(seen('kingparrot', b => b.pose.inFoot === 1)).toBe(true);
  });

  const adjacentPerched = (w: World) => w.perches.some((p, i) => p.by?.perch === i && p.by.act === 'perched' && w.perches[i + 1]?.br === p.br && w.perches[i + 1]!.by?.perch === i + 1);

  it('by day, birds on a branch keep a space between them', () => {
    const w = new World(seeded(5)); w.resize(375, 560);
    for (let i = 0; i < 24; i++) w.add('galah', 'u', '#f00', 'place');
    let perched = 0;
    run(w, 120, () => { expect(adjacentPerched(w)).toBe(false); perched = Math.max(perched, w.birds.filter(b => b.perch >= 0).length); });
    expect(perched).toBeGreaterThan(2);
  });

  it('at night they cuddle up in the trees, the rest sleep on the ground together, and they wake in the morning', () => {
    const w = new World(seeded(9)); w.resize(375, 560);
    for (let i = 0; i < 90; i++) w.add('currawong', `u${i % 4}`, '#f00', 'place');
    run(w, 20);
    w.night = true;
    run(w, 60);
    const perched = w.birds.filter(b => b.perch >= 0 && b.act === 'perched'), ground = w.birds.filter(b => b.act === 'sleep' && b.s.ground);
    expect(perched.length + ground.length).toBe(90);
    expect(w.perches.every(p => p.by)).toBe(true); // every spot in the trees taken before anyone sleeps on the ground
    expect(adjacentPerched(w)).toBe(true);
    expect(ground.length).toBeGreaterThan(0);
    // ground sleepers lie close to at least one other
    const near = ground.filter(b => ground.some(o => o !== b && Math.hypot(o.x - b.x, o.y - b.y) < 40 * w.px(b)));
    expect(near.length).toBeGreaterThan(ground.length * 0.7);
    w.night = false;
    run(w, 40);
    expect(w.birds.filter(b => b.act === 'sleep').length).toBe(0);
    expect(w.birds.filter(b => b.perch >= 0).length).toBeLessThan(perched.length * 0.4);
    for (const b of w.birds) expect(finite(b)).toBe(true);
  });

  it('ducks sleep on the pond or the bank, not in the trees', () => {
    const w = new World(seeded(4)); w.resize(375, 560);
    for (let i = 0; i < 12; i++) w.add('woodduck', 'u', '#f00', 'place');
    w.night = true;
    run(w, 60);
    expect(w.birds.filter(b => b.perch >= 0).length).toBe(0);
    expect(w.birds.every(b => (b.act === 'sleep' && b.s.ground) || (b.act === 'swim' && b.swim))).toBe(true);
  });

  it('wind blows now and then, curling or looping away, and gusts blow leaves about', () => {
    const w = new World(seeded(2)); w.resize(375, 560);
    w.add('magpie', 'u', '#f00', 'place');
    let lines = 0, gusts = 0, leaves = 0, last = 0;
    run(w, 90, () => {
      if (w.winds.length > last) lines += w.winds.length - last; last = w.winds.length;
      if (w.gust > 1.7) gusts++;
      leaves = Math.max(leaves, w.parts.filter(p => p.k === 'leaf').length);
      for (const d of w.winds) for (const u of [0, 0.3, 0.6, 1]) for (const v of windPt(d, u)) expect(Number.isFinite(v)).toBe(true);
    });
    expect(lines).toBeGreaterThan(8);
    expect(gusts).toBeGreaterThan(0);
    expect(leaves).toBeGreaterThan(0);
    expect(w.motes.length).toBeGreaterThan(10);
    for (const m of w.motes) { expect(m.x).toBeGreaterThan(-10); expect(m.x).toBeLessThan(385); }
  });

  it('keeps birds where they were when the screen changes size', () => {
    const w = new World(seeded(11)); w.resize(375, 560);
    for (let i = 0; i < 8; i++) w.add('magpie', 'u', '#f00', 'place');
    run(w, 5);
    w.resize(750, 900);
    for (const b of w.birds) { expect(finite(b)).toBe(true); expect(b.x).toBeLessThan(750 + 90); }
    run(w, 20);
    for (const b of w.birds) expect(finite(b)).toBe(true);
  });
});
