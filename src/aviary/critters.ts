// The clearing's other animals. A powerful owl lives in the hollow of the old stag and comes out at night to
// hunt the antechinus scurrying about; skinks dart around by day and a water dragon basks by the pond; now and
// then at dusk a red-bellied black snake slides across and sends the birds up; a kangaroo or wallaby sometimes
// hops by in the distance; and at night a wombat comes out of its burrow on the left to graze.
// Only types come from sim.ts, so there's no import loop at runtime.
import type { Prop, World } from './sim';

export type CritterKind = 'owl' | 'antechinus' | 'skink' | 'dragon' | 'snake' | 'roo' | 'wombat';
export interface Critter {
  k: CritterKind;
  /** Ground position (y is depth) and height above it, like the birds. */
  x: number; y: number; a: number; face: number;
  st: string; t: number; dur: number; next: string;
  /** A flight or move: from (sx, sy, sa) to (tx, ty, ta), with a hump of `arc` (owl). */
  sx: number; sy: number; sa: number; tx: number; ty: number; ta: number; arc: number;
  ph: number; v: number; look: number; hidden: boolean;
  prey: Critter | null; tgt: Critter | null;
  /** The snake's body: where its head has been, newest first. */
  trail: [number, number][];
  out: number; gone: boolean; hoot: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function make(w: World, k: CritterKind): Critter {
  return { k, x: 0, y: 0, a: 0, face: 1, st: 'in', t: 0, dur: w.r(2, 8), next: '', sx: 0, sy: 0, sa: 0, tx: 0, ty: 0, ta: 0, arc: 0,
    ph: w.rand() * 9, v: 0, look: 0, hidden: true, prey: null, tgt: null, trail: [], out: 0, gone: false, hoot: -9 };
}
const set = (c: Critter, st: string, dur = 0) => { c.st = st; c.t = 0; c.dur = dur; };
/** Screen pixels per unit for a critter (the owl takes its tree's depth; kangaroos are further off than they stand). */
export function critterScale(w: World, c: Critter) {
  return w.U * w.scaleAt(c.k === 'owl' && c.st !== 'fly' ? w.stag.y : c.y) * (c.k === 'roo' ? (c.v ? 1.3 : 1.6) : c.k === 'owl' ? 1.25 : 1);
}
/** Where to draw it in depth order with the birds and plants. */
export function critterDepth(w: World, c: Critter) {
  if (c.k === 'owl') return c.st === 'fly' ? 5000 + c.y : w.stag.y + 0.5;
  return c.y;
}
const COVER = new Set(['tussock', 'teatree', 'grevillea', 'banksia', 'fern', 'wattle', 'heath', 'bracken', 'shrub', 'log', 'boulder']);
function cover(w: World): { x: number; y: number } {
  const ps = w.props.filter(p => COVER.has(p.k) && p.y > w.top);
  const p: Prop | undefined = ps[Math.floor(w.rand() * ps.length)];
  const x = (p?.x ?? 0) + w.r(-6, 6), y = (p?.y ?? 0) + 2;
  return p && w.inBounds(x, y) && !w.inPond(x, y, 1.12) ? { x, y } : w.spot(null); // never out of a tussock at the water's edge, into the water
}
/** Head for (tx, ty) at `speed` px/s; true on arrival. */
function moveTo(c: Critter, speed: number, dt: number) {
  const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy), step = speed * dt;
  if (Math.abs(dx) > 1) c.face = dx > 0 ? 1 : -1;
  if (d <= step) { c.x = c.tx; c.y = c.ty; return true; }
  c.x += (dx / d) * step; c.y += (dy / d) * step;
  return false;
}
/** A spot near (x, y) a small animal can run to. */
/** A spot near (x, y) a small animal can run to, on dry land and without crossing water (from `from`, if given). */
function near(w: World, x: number, y: number, min: number, max: number, from?: { x: number; y: number }) {
  for (let i = 0; i < 16; i++) {
    const a = w.rand() * Math.PI * 2, d = w.r(min, max), tx = x + Math.cos(a) * d, ty = y + Math.sin(a) * d * 0.5;
    if (w.okGround(tx, ty) && !(from && w.crossesPond(from.x, from.y, tx, ty))) return { x: tx, y: ty };
  }
  return from ? { x: from.x, y: from.y } : { x, y };
}
/** Can a small animal get from here to there without getting wet? */
const dry = (w: World, m: Critter, tx: number, ty: number) => !w.inPond(tx, ty, 1.02) && !w.crossesPond(m.x, m.y, tx, ty);
function fly(c: Critter, tx: number, ty: number, ta: number, next: string, arc: number, speed: number) {
  c.sx = c.x; c.sy = c.y; c.sa = c.a; c.tx = tx; c.ty = ty; c.ta = ta; c.next = next; c.arc = arc;
  set(c, 'fly', clamp(Math.hypot(tx - c.x, (ty - c.y) * 1.3, ta - c.a) / speed, 0.5, 3));
  c.face = tx >= c.x ? 1 : -1;
}
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Is it dusk (when the snake might come out)? */
export const isDusk = (w: World) => w.hour >= 17.2 && w.hour < 20.4;

// ---------- the powerful owl ----------
function owl(w: World, o: Critter, dt: number) {
  const S = w.stag, hollowA = S.y - S.hy, perchA = S.y - S.py;
  if (o.st === 'in') { o.hidden = true; o.x = S.hx; o.y = S.y; o.a = hollowA; if (w.night && o.t > o.dur) set(o, 'peek', w.r(2.5, 5)); return; }
  o.hidden = false;
  switch (o.st) {
    case 'peek': // just its head, looking out of the hollow
      o.x = S.hx; o.y = S.y; o.a = hollowA; o.look = Math.sin(o.t * 1.4);
      if (!w.night) set(o, 'in', w.r(2, 6));
      else if (o.t > o.dur) fly(o, S.px, S.y, perchA, 'perch', 6, 60);
      break;
    case 'fly': {
      if (o.tgt && o.next === 'grab') { o.tx = o.tgt.x; o.ty = o.tgt.y; } // homing in on its prey
      const u = Math.min(1, o.t / o.dur), e = u * u * (3 - 2 * u);
      o.x = lerp(o.sx, o.tx, e); o.y = lerp(o.sy, o.ty, e); o.a = Math.max(0, lerp(o.sa, o.ta, e) + o.arc * Math.sin(Math.PI * u));
      o.ph += dt * (o.next === 'grab' ? 3 : 7);
      if (u < 1) break;
      if (o.next === 'grab') { // talons out: a catch, or a miss and the antechinus bolts
        const m = o.tgt; o.tgt = null;
        if (m && !m.hidden && m.st !== 'dead' && dist(o, m) < 12 && w.rand() < 0.6) { o.prey = m; set(m, 'held'); m.hidden = true; }
        else if (m && m.st !== 'dead') bolt(w, m, o.x);
        fly(o, S.px, S.y, perchA, o.prey ? 'eat' : 'perch', 10, 70);
      } else if (o.next === 'in') set(o, 'in', w.r(30, 60));
      else { o.x = S.px; o.y = S.y; o.a = perchA; set(o, o.next, o.next === 'eat' ? w.r(4, 7) : w.r(4, 9)); }
      break;
    }
    case 'eat': // tearing at its catch
      if (o.t > o.dur) { if (o.prey) { set(o.prey, 'dead', w.r(10, 25)); o.prey = null; } set(o, 'perch', w.r(6, 14)); }
      break;
    case 'perch': { // watching the clearing, head turning slowly, hooting now and then
      o.look = Math.sin(o.t * 0.6 + o.ph) * 0.9;
      if (o.t > 2 && w.rand() < dt / 18) { o.hoot = w.t; w.onOwl(o.x); }
      if (!w.night) { fly(o, S.hx, S.y, hollowA, 'in', 4, 50); break; }
      if (o.t > o.dur) {
        const mice = w.critters.filter(m => m.k === 'antechinus' && !m.hidden && m.st !== 'dead' && m.st !== 'held');
        const m = mice.sort((a, b) => dist(a, o) - dist(b, o))[0];
        if (m && w.rand() < 0.7) { o.tgt = m; fly(o, m.x, m.y, 0, 'grab', -6, 85); }
        else set(o, 'perch', w.r(5, 12));
      }
      break;
    }
  }
}
/** A small animal makes a dash for it, away from x. */
function bolt(w: World, m: Critter, fromX: number) {
  const p = near(w, m.x + Math.sign(m.x - fromX || 1) * 40, m.y, 10, 30, m);
  m.tx = p.x; m.ty = p.y; m.v = 1; set(m, 'dash');
}

// ---------- small things on the ground: antechinus at night, skinks by day ----------
function scurrier(w: World, m: Critter, dt: number, awake: boolean, speed: number) {
  if (m.st === 'held') return;
  if (m.st === 'dead') { m.hidden = true; if (m.t > m.dur) set(m, 'hide', w.r(2, 8)); return; }
  if (!awake) { m.hidden = true; if (m.st !== 'hide') set(m, 'hide', w.r(2, 10)); return; }
  const k = critterScale(w, m);
  switch (m.st) {
    case 'hide':
      m.hidden = true;
      if (m.t > m.dur) { const p = cover(w); m.x = p.x; m.y = p.y; m.hidden = false; set(m, 'sniff', w.r(0.4, 1.4)); }
      return;
    case 'sniff': case 'bask':
      if (m.t > m.dur) {
        // somewhere to go: back under cover, a sunny rock (skinks), or just a bit further on; only places it can reach on land
        const r = w.rand(), rocks = w.props.filter(p => p.k === 'rock' && dry(w, m, p.x, p.y - 0.5)), cov = cover(w);
        if (r < 0.12 && dry(w, m, cov.x, cov.y)) { m.tx = cov.x; m.ty = cov.y; m.v = 2; }
        else if (m.k === 'skink' && r < 0.45 && rocks.length) { const p = rocks[Math.floor(w.rand() * rocks.length)]!; m.tx = p.x; m.ty = p.y - 0.5; m.v = 3; }
        else { const p = near(w, m.x, m.y, 12, 50, m); m.tx = p.x; m.ty = p.y; m.v = 0; }
        set(m, 'dash');
      }
      break;
    case 'dash': {
      const px = m.x, py = m.y;
      const wet = w.inPond(px, py, 1.02);
      if (wet) { if (w.inPond(m.tx, m.ty, 1.02)) { const p = near(w, px, py, 6, 50); m.tx = p.x; m.ty = p.y; } } // somehow in the water: make for the bank
      else if (w.inPond(m.tx, m.ty, 1.02)) { m.tx = px; m.ty = py; } // never into the water: it stops at the bank
      const there = moveTo(m, speed * k * (m.v === 1 ? 1.6 : 1), dt);
      if (!wet && w.inPond(m.x, m.y, 1.02)) { m.x = px; m.y = py; set(m, 'sniff', w.r(0.3, 0.8)); break; }
      if (there) {
        if (m.v === 2) set(m, 'hide', w.r(3, 12));
        else set(m, m.v === 3 ? 'bask' : 'sniff', m.v === 3 ? w.r(4, 10) : w.r(0.4, 1.6));
      }
      break;
    }
  }
  m.hidden = m.st === 'hide'; m.ph += dt * (m.st === 'dash' ? 30 : 4);
  // anything big coming close sends it running
  if (m.st !== 'dash' || m.v !== 1) {
    const big = w.birds.find(b => !b.gone && b.alt < 2 && b.perch < 0 && Math.hypot(b.x - m.x, b.y - m.y) < 26 * w.px(b) + 8)
      ?? w.critters.find(c => (c.k === 'snake' || c.k === 'wombat') && !c.hidden && dist(c, m) < 40);
    if (big && w.rand() < dt * 6) bolt(w, m, big.x);
  }
}

// ---------- the water dragon ----------
function dragon(w: World, d: Critter, dt: number) {
  const rocks = w.props.filter(p => p.k === 'rock' && p.x > 20 && p.x < w.w - 20);
  if (w.night) { d.hidden = true; if (d.st !== 'sleep') set(d, 'sleep'); return; }
  if (d.st === 'sleep' || d.st === 'in') { const p = rocks[Math.floor(w.rand() * rocks.length)]; if (!p) return; d.x = p.x; d.y = p.y - 0.5; set(d, 'bask', w.r(5, 12)); }
  d.hidden = false;
  const k = critterScale(w, d);
  switch (d.st) {
    case 'bask': // sunning on a rock, bobbing its head now and then
      if (d.t > d.dur) { const p = rocks[Math.floor(w.rand() * rocks.length)]; if (p) { d.tx = p.x; d.ty = p.y - 0.5; set(d, 'walk'); } else set(d, 'bask', 5); }
      break;
    case 'walk': if (moveTo(d, 14 * k, dt)) set(d, 'bask', w.r(6, 15)); break;
    case 'run': { // up on its hind legs and into the water
      if (moveTo(d, 95 * k, dt) || w.inPond(d.x, d.y, 0.9)) { w.splash(d.x, d.y, 5); set(d, 'swim', w.r(6, 12)); const p = w.pondPoint(0.6); d.tx = p.x; d.ty = p.y; }
      break;
    }
    case 'swim': // just its head above the water
      if (moveTo(d, 10 * k, dt) && d.t < d.dur) { const p = w.pondPoint(0.6); d.tx = p.x; d.ty = p.y; }
      if (w.rand() < dt * 1.2) w.ripple(d.x, d.y);
      if (d.t > d.dur) { const p = rocks.sort((a, b) => dist(a, d) - dist(b, d))[0]; if (p) { d.tx = p.x; d.ty = p.y - 0.5; set(d, 'walk'); } }
      break;
  }
  d.ph += dt;
  if (d.st === 'bask' || d.st === 'walk') { // a bird or a snake too close: into the water it goes
    const big = w.birds.find(b => !b.gone && b.alt < 2 && b.perch < 0 && Math.hypot(b.x - d.x, b.y - d.y) < 32 * w.px(b) + 10)
      ?? w.critters.find(c => (c.k === 'snake' || c.k === 'wombat') && !c.hidden && dist(c, d) < 60);
    if (big && w.rand() < dt * 3) {
      let best = { x: d.x, y: d.y }, bd = Infinity;
      for (const e of w.pools) { const a = Math.atan2(d.y - e.y, d.x - e.x), p = { x: e.x + Math.cos(a) * e.rx * 0.6, y: e.y + Math.sin(a) * e.ry * 0.6 }, dd = dist(p, d); if (p.x > 10 && dd < bd) { bd = dd; best = p; } }
      d.tx = best.x; d.ty = best.y; set(d, 'run');
    }
  }
}

// ---------- the snake: rare, at dusk ----------
function snake(w: World, s: Critter, dt: number) {
  const k = critterScale(w, s), L = 150 * k;
  s.hidden = false; s.ph += dt;
  if (s.st === 'rear') { if (s.t > s.dur) set(s, 'go'); }
  else {
    const want = Math.atan2((s.ty - s.y) * 2, s.tx - s.x), h = want + Math.sin(s.ph * 3.2) * 0.55, step = 24 * k * dt;
    let ny = s.y + Math.sin(h) * step * 0.5;
    if (ny < w.top || ny > w.bottom) { s.ty = clamp(s.y + (s.y < (w.top + w.bottom) / 2 ? 40 : -40), w.top, w.bottom); ny = s.y; }
    s.x += Math.cos(h) * step; s.y = ny; s.face = Math.cos(h) >= 0 ? 1 : -1;
    const wet = w.inPond(s.x, s.y); // red-bellied blacks swim well: it just carries on across, head up
    if (wet && w.rand() < dt * 4) w.ripple(s.x, s.y);
    if (!wet && w.rand() < dt * 0.1 && s.t > 3) set(s, 'rear', w.r(1.2, 2.2)); // stops, lifts its head and tastes the air
  }
  const last = s.trail[0];
  if (!last || Math.hypot(last[0] - s.x, last[1] - s.y) > 1.2) s.trail.unshift([s.x, s.y]);
  let len = 0;
  for (let i = 1; i < s.trail.length; i++) { len += Math.hypot(s.trail[i]![0] - s.trail[i - 1]![0], s.trail[i]![1] - s.trail[i - 1]![1]); if (len > L) { s.trail.length = i + 1; break; } }
  // birds nearby take off with alarm calls
  for (const b of w.birds) {
    if (b.gone || b.leaving || b.perch >= 0 || b.alt > 2 || b.act === 'startle' || b.act === 'depart' || b.act === 'arrive') continue;
    if (Math.hypot(b.x - s.x, (b.y - s.y) * 1.3) < 70 * k + 30) w.go(b, 'startle', { fx: s.x, delay: w.r(0, 0.25) });
  }
  if (s.t > 2 && (s.x < -50 || s.x > w.w + 50)) s.gone = true;
  if (s.t > 70) s.gone = true;
}

// ---------- a kangaroo or wallaby hopping by in the distance ----------
function roo(w: World, r: Critter, dt: number) {
  const k = critterScale(w, r), HOP = r.v ? 0.42 : 0.5;
  r.hidden = false; r.ph += dt;
  if (r.st === 'hop') {
    r.x += r.face * (r.v ? 48 : 62) * k * dt;
    if (r.t > HOP) {
      r.t -= HOP; const x = w.rand();
      if (r.x > 20 && r.x < w.w - 20 && x < 0.07) set(r, 'graze', w.r(3, 7));
      else if (r.x > 20 && r.x < w.w - 20 && x < 0.12) set(r, 'alert', w.r(1.5, 3));
    }
  } else if (r.t > r.dur) set(r, 'hop');
  if ((r.face > 0 && r.x > w.w + 60) || (r.face < 0 && r.x < -60)) r.gone = true;
}

// ---------- the wombat ----------
function wombat(w: World, b: Critter, dt: number) {
  const B = w.burrow, k = critterScale(w, b);
  b.ph += dt;
  switch (b.st) {
    case 'in': b.hidden = true; b.x = B.x - 30 * k; b.y = B.y; b.face = 1; if (w.night && b.t > b.dur) set(b, 'peek', w.r(2, 3.5)); return;
    case 'peek': b.hidden = false; b.x = B.x + 4 * k; if (b.t > b.dur) { b.tx = B.x + 70 * k; b.ty = B.y + w.r(-4, 6); b.out = 0; set(b, 'walk'); b.next = 'graze'; } break;
    case 'walk': if (moveTo(b, 13 * k, dt)) set(b, b.next, b.next === 'scratch' ? w.r(2, 3) : w.r(4, 9)); break;
    case 'graze': case 'scratch':
      if (b.t > b.dur) {
        const p = near(w, B.x + w.w * 0.12, B.y + 8, 0, w.w * 0.16);
        b.tx = p.x; b.ty = p.y; b.next = w.rand() < 0.25 ? 'scratch' : 'graze'; set(b, 'walk');
      }
      break;
    case 'home': if (moveTo(b, 15 * k, dt)) { b.tx = B.x - 60 * k; b.ty = B.y; set(b, 'enter'); } break;
    case 'enter': if (moveTo(b, 14 * k, dt)) set(b, 'in', w.r(20, 50)); break;
  }
  b.out += dt;
  if ((b.out > (b.v || (b.v = w.r(45, 100))) || !w.night) && ['walk', 'graze', 'scratch'].includes(b.st)) { b.tx = B.x + 6 * k; b.ty = B.y; set(b, 'home'); b.v = 0; }
}

/** One frame for every animal; spawns the snake (dusk only, rarely) and the occasional kangaroo or wallaby. */
export function stepCritters(w: World, dt: number) {
  if (!w.critters.length) {
    w.critters.push(make(w, 'owl'), make(w, 'wombat'), make(w, 'dragon'));
    for (let i = 0; i < 3; i++) w.critters.push(make(w, 'antechinus'), make(w, 'skink'));
    for (const c of w.critters) if (c.k === 'antechinus' || c.k === 'skink') set(c, 'hide', w.r(0.5, 6));
  }
  w.snakeT -= dt; w.rooT -= dt;
  if (w.snakeT <= 0) {
    w.snakeT = w.r(25, 60);
    if (isDusk(w) && !w.critters.some(c => c.k === 'snake') && w.rand() < 0.35) spawn(w, 'snake');
  }
  if (w.rooT <= 0) { w.rooT = w.r(60, 180); if (!w.critters.some(c => c.k === 'roo')) spawn(w, 'roo'); }
  for (const c of w.critters) {
    c.t += dt;
    switch (c.k) {
      case 'owl': owl(w, c, dt); break;
      case 'antechinus': scurrier(w, c, dt, w.night, 55); break;
      case 'skink': scurrier(w, c, dt, !w.night, 80); break;
      case 'dragon': dragon(w, c, dt); break;
      case 'snake': snake(w, c, dt); break;
      case 'roo': roo(w, c, dt); break;
      case 'wombat': wombat(w, c, dt); break;
    }
  }
  if (w.critters.some(c => c.gone)) w.critters = w.critters.filter(c => !c.gone);
}

export function spawn(w: World, k: 'snake' | 'roo') {
  const c = make(w, k), left = w.rand() < 0.5;
  c.face = left ? 1 : -1; c.hidden = false;
  if (k === 'snake') {
    c.x = left ? -15 : w.w + 15; c.y = w.r(w.top + w.gh * 0.15, w.bottom - w.gh * 0.08);
    c.tx = left ? w.w + 60 : -60; c.ty = w.r(w.top, w.bottom); set(c, 'go');
  } else {
    c.v = w.rand() < 0.35 ? 1 : 0; // 0 an eastern grey kangaroo, 1 a swamp wallaby
    c.x = left ? -40 : w.w + 40; c.y = w.hor + w.gh * w.r(0.025, 0.075); set(c, 'hop');
  }
  w.critters.push(c);
  return c;
}

/** A tap on an animal: the owl turns to look at you and hoots, the wombat stops to look, the kangaroo sits up,
 *  the small ones bolt, the snake rears. True if something was tapped. */
export function tapCritter(w: World, x: number, y: number) {
  for (const c of w.critters) {
    if (c.hidden) continue;
    const k = critterScale(w, c), h = c.k === 'owl' ? 40 : c.k === 'roo' ? 60 : c.k === 'wombat' ? 30 : c.k === 'dragon' ? 12 : 6;
    const cx = c.x, cy = c.y - c.a - (h * k) / 2, r = Math.max(14, h * k * 0.7);
    if (c.k === 'snake' ? !c.trail.some(([tx, ty]) => Math.hypot(tx - x, ty - y) < 14) : Math.hypot(x - cx, y - cy) > r) continue;
    if (c.k === 'owl') { c.look = 0; c.hoot = w.t; w.onOwl(c.x); if (c.st === 'perch') set(c, 'perch', w.r(3, 6)); }
    else if (c.k === 'wombat' && ['walk', 'graze', 'scratch'].includes(c.st)) { c.next = 'graze'; set(c, 'scratch', 1.5); }
    else if (c.k === 'roo' && c.st !== 'alert') set(c, 'alert', w.r(1.5, 2.5));
    else if (c.k === 'snake') set(c, 'rear', 1.5);
    else if (c.k === 'dragon') { c.t = c.dur + 1; }
    else bolt(w, c, x);
    return true;
  }
  return false;
}
