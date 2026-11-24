// Visitors passing over the clearing: a loose, screeching flock of sulphur-crested cockatoos now and then through the
// day, yellow-tailed black cockatoos wailing slowly across at dusk, and microbats flitting about all night, darting
// after moths. They're only passing through: nobody lands, and the flocks are high and far off.
import type { World } from './sim';

export type FlyerKind = 'cockatoo' | 'blackcockatoo' | 'bat';
export interface Flyer {
  k: FlyerKind;
  x: number; y: number; vx: number; vy: number;
  /** Birds: px per rig unit. Bats: px per unit of a bat about 14 units across. */
  s: number;
  ph: number; hz: number;   // wingbeat phase, and beats a second
  t: number; t0: number;    // age, and a phase of its own for gliding and bobbing
  female: boolean;
  tx: number; ty: number;   // bats: where it's darting to next
  life: number;             // bats: how long before it heads off
  call: number;             // time to its next call
}

const TAU = Math.PI * 2;
/** Clear day: white cockatoos. Dusk: black cockatoos. The bats come out once it's dark. */
const isDay = (w: World) => !w.night && w.hour >= 7 && w.hour < 16.8;
const isDusk = (w: World) => w.hour >= 17 && w.hour < 20;

function flock(w: World, k: 'cockatoo' | 'blackcockatoo') {
  const white = k === 'cockatoo', n = white ? 5 + Math.floor(w.rand() * 8) : 3 + Math.floor(w.rand() * 5);
  const dir = w.rand() < 0.5 ? 1 : -1, y0 = w.h * w.r(0.05, white ? 0.2 : 0.24), speed = w.w / w.r(white ? 8 : 11, white ? 12 : 15);
  const size = w.U * (white ? 1.05 : 1.25) * w.r(0.3, 0.42);
  for (let i = 0; i < n; i++) {
    const lag = i * w.r(12, 30) + w.r(0, 20);
    w.flyers.push({
      k, x: dir > 0 ? -40 - lag : w.w + 40 + lag, y: y0 + w.r(-0.05, 0.05) * w.h, vx: dir * speed * w.r(0.94, 1.06), vy: 0,
      s: size * w.r(0.9, 1.1), ph: w.rand() * TAU, hz: (white ? 4.5 : 3.2) * w.r(0.9, 1.1), t: 0, t0: w.rand() * TAU,
      female: w.rand() < 0.5, tx: 0, ty: 0, life: 0, call: w.r(0.3, 3),
    });
  }
}

function bat(w: World) {
  const left = w.rand() < 0.5, y = w.r(w.h * 0.1, w.hor + w.gh * 0.25);
  w.flyers.push({
    k: 'bat', x: left ? -12 : w.w + 12, y, vx: 0, vy: 0, s: w.U * w.r(0.8, 1.1), ph: w.rand() * TAU, hz: w.r(11, 15), t: 0, t0: w.rand() * TAU,
    female: false, tx: w.r(w.w * 0.15, w.w * 0.85), ty: w.r(w.h * 0.1, w.hor + w.gh * 0.35), life: w.r(25, 70), call: 0,
  });
}

/** Somewhere a bat might hunt next: out over the clearing against the sky, round the treetops, or low over the pond. */
function batTarget(w: World, f: Flyer) {
  if (w.rand() < 0.3 && w.pools.length) { const e = w.pools[Math.floor(w.rand() * w.pools.length)]!; f.tx = e.x + w.r(-1, 1) * e.rx; f.ty = e.y - w.r(20, 90) * w.U; }
  else if (w.rand() < 0.6) { f.tx = w.r(w.w * 0.1, w.w * 0.9); f.ty = w.r(w.h * 0.1, w.hor - 10); }
  else { f.tx = f.x + w.r(-160, 160) * w.U; f.ty = f.y + w.r(-70, 70) * w.U; }
  f.tx = Math.max(w.w * 0.04, Math.min(w.w * 0.96, f.tx)); f.ty = Math.max(w.h * 0.06, Math.min(w.hor + w.gh * 0.5, f.ty));
}

export function stepFlyers(w: World, dt: number) {
  w.flockT -= dt;
  if (w.flockT <= 0) {
    const day = isDay(w), dusk = isDusk(w);
    w.flockT = day ? w.r(45, 110) : dusk ? w.r(25, 60) : w.r(20, 40);
    if (day && w.rand() < 0.85) flock(w, 'cockatoo');
    else if (dusk && w.rand() < 0.85) flock(w, 'blackcockatoo');
  }
  // a few bats about all night, coming and going
  let bats = 0; for (const f of w.flyers) if (f.k === 'bat' && f.life > 0) bats++;
  if (w.night && bats < 2 + (w.batN % 3) && w.rand() < dt * 0.6) { bat(w); w.batN++; }

  for (const f of w.flyers) {
    f.t += dt; f.ph += dt * f.hz * TAU;
    if (f.k !== 'bat') { // steady across, rising and falling a little, calling now and then
      f.x += f.vx * dt; f.y += Math.sin(f.t * 0.9 + f.t0) * 5 * w.U * dt;
      f.call -= dt;
      if (f.call <= 0) { f.call = f.k === 'cockatoo' ? w.r(1.5, 5) : w.r(3, 7); if (f.x > 0 && f.x < w.w) w.onFly?.(f.k, f.x); }
      continue;
    }
    // bats: quick, jinking flight from one spot to the next, snapping up any moth they come close to
    f.life -= dt;
    if (f.life <= 0 || !w.night) { f.tx = f.x < w.w / 2 ? -60 : w.w + 60; f.ty = f.y - 20; f.life = Math.min(f.life, 0); }
    else {
      let prey = null as null | { x: number; y: number; g: typeof w.bugs[number] };
      for (const g of w.bugs) if (g.k === 'moth' && w.bugAwake(g) && g.rest <= 0) {
        const gy = g.y - g.a; if (Math.abs(g.x - f.x) < 90 * w.U && Math.abs(gy - f.y) < 60 * w.U) { prey = { x: g.x, y: gy, g }; break; }
      }
      if (prey) { f.tx = prey.x; f.ty = prey.y; if (Math.hypot(prey.x - f.x, prey.y - f.y) < 6 * w.U && w.rand() < 0.5) { w.eatBug(prey.g); batTarget(w, f); } }
      else if (Math.hypot(f.tx - f.x, f.ty - f.y) < 18 * w.U || w.rand() < dt * 0.6) batTarget(w, f);
    }
    const dx = f.tx - f.x, dy = f.ty - f.y, d = Math.hypot(dx, dy) || 1, acc = 700 * w.U, max = 160 * w.U;
    f.vx += ((dx / d) * acc + (w.rand() - 0.5) * 900 * w.U) * dt; f.vy += ((dy / d) * acc + (w.rand() - 0.5) * 900 * w.U) * dt;
    const v = Math.hypot(f.vx, f.vy); if (v > max) { f.vx *= max / v; f.vy *= max / v; }
    f.x += f.vx * dt; f.y += f.vy * dt;
  }
  if (w.flyers.some(f => gone(w, f))) w.flyers = w.flyers.filter(f => !gone(w, f));
}
/** Off the far side (or out of sight, for a bat that's headed off). */
const gone = (w: World, f: Flyer) => (f.k === 'bat' ? f.life <= 0 && (f.x < -40 || f.x > w.w + 40) : (f.vx > 0 ? f.x > w.w + 80 : f.x < -80) || f.t > 120);
