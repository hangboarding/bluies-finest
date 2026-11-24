// The bird simulation runs without a canvas, so every species can be put through a long, busy stretch
// of time: seed thrown, birds startled, climbers tapped, birds leaving. Nothing may break, get stuck or wander off.
import { describe, it, expect } from 'vitest';
import { World, windPt, type Bird } from '../src/aviary/sim';
import { spawn } from '../src/aviary/critters';
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
          expect(b.alt).toBeGreaterThanOrEqual(0); expect(b.alt).toBeLessThan(560 * 1.5); // arriving birds start off the top of the screen
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
    }, 30_000); // over four simulated minutes of 14 birds: about a second here, but CI machines are slower
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

  it('has a pond running off the left edge towards the horizon, and nobody is set down in the water or inside a bush', () => {
    const w = new World(seeded(6)); w.resize(375, 560);
    expect(w.inPond(-5, w.hor + w.gh * 0.76)).toBe(true); // off the left edge
    expect(w.inPond(375 * 0.52, w.hor + w.gh * 0.31)).toBe(true); // the far end, towards the horizon
    expect(w.inPond(375 * 0.8, w.hor + w.gh * 0.7)).toBe(false);
    expect(w.props.filter(p => p.k === 'rock').length).toBeGreaterThan(8);
    for (let i = 0; i < 300; i++) { const p = w.spot(null); expect(w.okGround(p.x, p.y)).toBe(true); }
    const b = w.add('magpie', 'u', '#f00', 'place');
    for (let i = 0; i < 100; i++) {
      const bank = w.pondEdge(b, 1.1), shallows = w.pondEdge(b, 0.85), out = w.pondPoint(0.7);
      expect(w.inPond(bank.x, bank.y)).toBe(false); expect(w.inPond(shallows.x, shallows.y)).toBe(true); expect(w.inPond(out.x, out.y)).toBe(true);
      expect(bank.x).toBeGreaterThan(14); expect(out.x).toBeGreaterThan(14);
    }
    for (const p of w.props.filter(p => p.foot > 0)) expect(w.okGround(p.x, p.y)).toBe(false);
  });

  it('insects of every kind come and go; the birds hunt them on the ground and catch them in the air', () => {
    const eaten = (id: keyof typeof SPECIES, night = false) => {
      const w = new World(seeded(12)); w.resize(375, 560); w.night = night;
      for (let i = 0; i < 12; i++) w.add(id, 'u', '#f00', 'place');
      const n: Record<string, number> = {}, was = new Map(w.bugs.map(g => [g, g.dead]));
      run(w, 180, () => {
        for (const g of w.bugs) { if (g.dead > 0 && !(was.get(g)! > 0)) n[g.k] = (n[g.k] ?? 0) + 1; was.set(g, g.dead); expect([g.x, g.y, g.a].every(Number.isFinite)).toBe(true); }
      });
      return { n, kinds: new Set(w.bugs.map(g => g.k)) };
    };
    const mag = eaten('magpie');
    expect(mag.kinds.size).toBe(6);
    expect((mag.n.hopper ?? 0) + (mag.n.beetle ?? 0)).toBeGreaterThan(0); // hunted on the ground
    const wat = eaten('wattlebird');
    expect((wat.n.midge ?? 0) + (wat.n.butterfly ?? 0) + (wat.n.dragonfly ?? 0)).toBeGreaterThan(0); // caught in the air
    const galahs = eaten('galah');
    expect(Object.keys(galahs.n).length).toBe(0); // seed-eaters leave them be
    const w = new World(seeded(1)); w.resize(375, 560);
    expect(w.bugs.filter(g => w.bugAwake(g)).every(g => g.k !== 'moth')).toBe(true); // moths only come out at night
    w.night = true;
    expect(w.bugs.some(g => g.k === 'moth' && w.bugAwake(g))).toBe(true);
    expect(w.bugs.some(g => g.k === 'butterfly' && w.bugAwake(g))).toBe(false);
  });

  const fresh = (seed: number, hour: number, birds = 0, id: keyof typeof SPECIES = 'magpie') => {
    const w = new World(seeded(seed)); w.resize(375, 560); w.hour = hour; w.night = hour >= 20 || hour < 5;
    for (let i = 0; i < birds; i++) w.add(id, 'u', '#f00', 'place');
    return w;
  };
  const of = (w: World, k: string) => w.critters.filter(c => c.k === k);
  const critFinite = (w: World) => w.critters.every(c => [c.x, c.y, c.a].every(Number.isFinite));

  it('the powerful owl comes out of its hollow at night, hunts antechinus, and goes back in by day', () => {
    const w = fresh(4, 22);
    let out = false, caught = 0, hoots = 0, last = '';
    w.onOwl = () => hoots++;
    run(w, 300, () => {
      const o = of(w, 'owl')[0]!; if (!o.hidden && o.st !== 'peek') out = true;
      for (const m of of(w, 'antechinus')) if (!m.hidden) expect(w.inPond(m.x, m.y), 'an antechinus in the water').toBe(false); // land only
      for (const m of of(w, 'antechinus')) { if (m.st === 'held' && last !== 'held' + of(w, 'antechinus').indexOf(m)) { caught++; last = 'held' + of(w, 'antechinus').indexOf(m); } }
      expect(critFinite(w)).toBe(true);
    });
    expect(out).toBe(true);
    expect(caught).toBeGreaterThan(0);
    expect(hoots).toBeGreaterThan(0);
    expect(of(w, 'skink').every(s => s.hidden)).toBe(true); // skinks are tucked away at night
    w.night = false; w.hour = 7;
    run(w, 40);
    expect(of(w, 'owl')[0]!.st).toBe('in');
    expect(of(w, 'antechinus').every(m => m.hidden)).toBe(true);
  });

  it('skinks dart about and the water dragon basks by the pond by day, bolting from birds', () => {
    const w = fresh(5, 11, 10);
    let skinks = 0, dragonRan = false, dragonOut = false;
    run(w, 200, () => {
      skinks = Math.max(skinks, of(w, 'skink').filter(s => !s.hidden).length);
      for (const s of of(w, 'skink')) if (!s.hidden) expect(w.inPond(s.x, s.y), 'a skink in the water').toBe(false); // land only
      const d = of(w, 'dragon')[0]!; if (!d.hidden) dragonOut = true; if (d.st === 'run' || d.st === 'swim') dragonRan = true;
      expect(critFinite(w)).toBe(true);
    });
    expect(skinks).toBeGreaterThan(0);
    expect(dragonOut && dragonRan).toBe(true);
    expect(of(w, 'antechinus').every(m => m.hidden)).toBe(true);
  });

  it('a snake turns up only at dusk, now and then, and sends nearby birds into the air', () => {
    const day = fresh(6, 13);
    let seen = false;
    run(day, 600, () => { if (of(day, 'snake').length) seen = true; });
    expect(seen).toBe(false);
    const dusk = fresh(6, 18.5);
    run(dusk, 600, () => { if (of(dusk, 'snake').length) seen = true; });
    expect(seen).toBe(true);
    // one slithers right past a flock on the ground
    const w = fresh(7, 18.5, 12);
    run(w, 3);
    const s = spawn(w, 'snake'); s.x = 10; s.y = w.birds[0]!.y; s.tx = w.w + 60; s.ty = s.y;
    let startled = 0;
    run(w, 25, () => { startled = Math.max(startled, w.birds.filter(b => b.act === 'startle').length); expect(critFinite(w)).toBe(true); });
    expect(startled).toBeGreaterThan(0);
  });

  it('kangaroos and wallabies hop across in the distance and are gone again', () => {
    const w = fresh(8, 16);
    let seen = 0;
    run(w, 400, () => { if (of(w, 'roo').length) seen++; for (const r of of(w, 'roo')) expect(r.y).toBeLessThan(w.hor + w.gh * 0.1); });
    expect(seen).toBeGreaterThan(0);
    const r = spawn(w, 'roo');
    run(w, 150);
    expect(w.critters.includes(r)).toBe(false);
  });

  it('the wombat comes out of its burrow at night, grazes nearby, and goes back underground by morning', () => {
    const w = fresh(9, 23);
    const b = of(w, 'wombat')[0] ?? (run(w, 0.1), of(w, 'wombat')[0]!);
    let out = false, far = 0;
    run(w, 120, () => { if (['walk', 'graze', 'scratch'].includes(b.st)) out = true; far = Math.max(far, Math.hypot(b.x - w.burrow.x, b.y - w.burrow.y)); });
    expect(out).toBe(true);
    expect(far).toBeLessThan(w.w * 0.45);
    w.night = false; w.hour = 6.5;
    run(w, 90);
    expect(b.st).toBe('in'); expect(b.hidden).toBe(true);
    const day = fresh(9, 13); run(day, 120);
    expect(of(day, 'wombat')[0]!.hidden).toBe(true);
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
