// Draws one bird, side-on and facing right, with its feet at (0, 0) and y pointing down. Every
// behaviour is a Pose: body tilt, neck and head, bill, crest, wings, tail and feet. The caller places,
// scales and flips the bird.
import type { Look, Patch, Species } from './species';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export interface Pose {
  pitch: number;   // body tilt (rad), + = breast up
  lift: number;    // body raised above standing height (units)
  crouch: number;  // 0..1, legs bent
  nAng: number;    // neck direction from the breast (rad, + = up)
  nExt: number;    // neck stretch (1 = normal)
  hAng: number;    // bill direction (rad, + = up); pointing backwards turns the head round
  gape: number;    // 0..1 bill open
  crest: number;   // 0..1 raised
  wing: number;    // 0 folded .. 1 spread
  flap: number;    // -1 (down) .. 1 (up), while spread
  far: number;     // far wing's spread as a share of `wing` (stretching one wing)
  tail: number;    // tail tilt (rad, + = up)
  fan: number;     // 0..1 tail fanned
  fluff: number;   // 0..1 feathers puffed
  tuck: number;    // 0..1 head tucked into the back (asleep)
  eye: number;     // 1 open, 0 shut
  fx: number; fy: number;   // near foot: forward offset and lift (units)
  bx: number; by: number;   // far foot
  legs: number;    // 1 standing/perched, 0 tucked away (flying, swimming)
  hold: 0 | 1 | 2 | 3;      // nothing, a grub, a seed, a crumb
  inFoot: number;  // 1: the item is held up in the near foot (parrots)
  wig: number;     // grub wriggle phase
  swim: number;    // 0..1 floating
  hackle: number;  // 0..1 throat feathers out (raven calls)
}
export type PoseKey = keyof Pose;

export function restPose(sp: Species): Pose {
  return {
    pitch: sp.pitch, lift: 0, crouch: 0, nAng: sp.id === 'woodduck' ? 1.3 : sp.pitch + 0.8, nExt: 1,
    hAng: sp.bill.type === 'hook' ? -0.28 : -0.1, gape: 0, crest: 0, wing: 0, flap: 0, far: 1, tail: 0, fan: 0, fluff: 0, tuck: 0, eye: 1,
    fx: 2, fy: 0, bx: -2, by: 0, legs: 1, hold: 0, inFoot: 0, wig: 0, swim: 0, hackle: 0,
  };
}

/** Points of the near wing, relative to the shoulder in the body's frame, from folded to spread. */
function wingPts(sp: Species, rx: number, ry: number, spread: number, flap: number): [number, number][] {
  const tip = -(rx * 1.22 + sp.wingTip), s = sp.span;
  const F: [number, number][] = [[rx * 0.1, -ry * 0.12], [rx * 0.05, ry * 0.55], [-rx * 0.55, ry * 0.85], [tip, ry * 0.62], [tip * 0.93, ry * 0.4], [-rx * 0.75, ry * 0.16], [-rx * 0.25, -ry * 0.14]];
  if (spread < 0.01) return F;
  const fe = Math.sign(flap || 1) * Math.max(0.16, Math.abs(flap));
  const E: [number, number][] = [[rx * 0.15, 0], [rx * 0.28, -s * 0.42], [rx * 0.06, -s * 0.82], [-rx * 0.28, -s], [-rx * 0.55, -s * 0.8], [-rx * 0.8, -s * 0.38], [-rx * 0.62, 0]]
    .map(([x, y]) => { const yy = y * fe; return [x - (flap < 0 ? Math.abs(yy) * 0.14 : 0), yy] as [number, number]; });
  return F.map((f, i) => [lerp(f[0], E[i]![0], spread), lerp(f[1], E[i]![1], spread)]);
}
const mix = (a: [number, number], b: [number, number], t: number): [number, number] => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
function poly(c: Ctx, pts: [number, number][], ox = 0, oy = 0) {
  c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x + ox, y + oy) : c.moveTo(x + ox, y + oy))); c.closePath();
}
/** Darken a #rrggbb colour. */
export function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16); if (hex.length !== 7 || Number.isNaN(n)) return hex;
  const f = (v: number) => Math.round(clamp(v * k, 0, 255)).toString(16).padStart(2, '0');
  return `#${f(n >> 16)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

function drawWing(c: Ctx, sp: Species, lk: Look, pts: [number, number][], ox: number, oy: number, col: (s?: string) => string, far: boolean, sil: boolean) {
  const k = far ? 0.72 : 1, tone = (s?: string) => (sil ? col(s) : shade(col(s), k));
  poly(c, pts, ox, oy); c.fillStyle = tone(lk.wing); c.fill();
  if (sil) return;
  const [p0, p1, p2, p3, p4, p5, p6] = pts as [[number, number], [number, number], [number, number], [number, number], [number, number], [number, number], [number, number]];
  if (lk.shoulder) { poly(c, [p0, mix(p0, p1, 0.75), mix(p1, p5, 0.32), mix(p6, p5, 0.35), p6], ox, oy); c.fillStyle = tone(lk.shoulder); c.fill(); }
  poly(c, [mix(p1, p2, 0.55), p2, p3, p4, mix(p5, p4, 0.45)], ox, oy); c.fillStyle = tone(lk.primary); c.fill();
  if (lk.wingPatch) { poly(c, [mix(p1, p2, 0.58), mix(p1, p2, 0.76), mix(mix(p5, p4, 0.62), p2, 0.45), mix(mix(p5, p4, 0.5), p1, 0.45)], ox, oy); c.fillStyle = tone(lk.wingPatch); c.fill(); }
  if (lk.scallop && !far) { // rosella: black feathers edged yellow-green
    c.save(); poly(c, pts, ox, oy); c.clip(); c.strokeStyle = lk.scallop; c.lineWidth = 1.1;
    for (let i = 0; i < 9; i++) { const a = mix(mix(p0, p6, (i % 3) / 2.4), mix(p1, p5, (i % 3) / 2.4), Math.floor(i / 3) / 2.6); c.beginPath(); c.arc(a[0] + ox, a[1] + oy, 2.4, 0.2, Math.PI - 0.2); c.stroke(); }
    c.restore();
  }
}

function leg(c: Ctx, hx: number, hy: number, fx: number, fy: number, sp: Species, lk: Look, col: (s?: string) => string, band: string | undefined, far: boolean, sil: boolean) {
  const t1 = sp.leg * 0.55, t2 = sp.leg * 0.6, w = Math.max(1.6, sp.leg * 0.085) * (sp.feet === 'web' ? 1.25 : 1);
  let dx = fx - hx, dy = fy - hy, d = Math.hypot(dx, dy); const mx = (t1 + t2) * 0.999;
  if (d > mx) { fx = hx + (dx / d) * mx; fy = hy + (dy / d) * mx; dx = fx - hx; dy = fy - hy; d = mx; }
  d = Math.max(d, 0.01);
  const a = Math.atan2(dy, dx), b = Math.acos(clamp((t1 * t1 + d * d - t2 * t2) / (2 * t1 * d), -1, 1));
  const kx = hx + Math.cos(a + b) * t1, ky = hy + Math.sin(a + b) * t1; // the heel bends backwards
  const legC = sil ? col() : shade(col(lk.leg), far ? 0.7 : 1);
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.strokeStyle = sil ? col() : shade(col(lk.thigh ?? lk.body), far ? 0.7 : 1); c.lineWidth = w * 2.3;
  c.beginPath(); c.moveTo(hx, hy); c.lineTo(lerp(hx, kx, 0.7), lerp(hy, ky, 0.7)); c.stroke();
  c.strokeStyle = legC; c.lineWidth = w;
  c.beginPath(); c.moveTo(lerp(hx, kx, 0.6), lerp(hy, ky, 0.6)); c.lineTo(kx, ky); c.lineTo(fx, fy); c.stroke();
  if (band && !far && !sil) { c.strokeStyle = band; c.lineWidth = w * 1.6; c.lineCap = 'butt'; c.beginPath(); c.moveTo(lerp(kx, fx, 0.4), lerp(ky, fy, 0.4)); c.lineTo(lerp(kx, fx, 0.6), lerp(ky, fy, 0.6)); c.stroke(); c.lineCap = 'round'; }
  c.strokeStyle = legC; c.lineWidth = w * 0.8;
  const toe = sp.leg * 0.32;
  if (sp.feet === 'web') { c.fillStyle = legC; c.beginPath(); c.moveTo(fx - 1, fy); c.lineTo(fx + toe * 1.1, fy - 1.2); c.lineTo(fx + toe * 1.1, fy + 0.8); c.closePath(); c.fill(); c.stroke(); return; }
  c.beginPath();
  if (sp.feet === 'zygo') { c.moveTo(fx, fy); c.lineTo(fx + toe * 0.8, fy + 0.2); c.moveTo(fx, fy); c.lineTo(fx + toe * 0.6, fy - 0.9); c.moveTo(fx, fy); c.lineTo(fx - toe * 0.6, fy + 0.2); }
  else { c.moveTo(fx, fy); c.lineTo(fx + toe, fy + 0.2); c.moveTo(fx, fy); c.lineTo(fx + toe * 0.75, fy - 0.8); c.moveTo(fx, fy); c.lineTo(fx - toe * 0.55, fy + 0.2); }
  c.stroke();
}

function bill(c: Ctx, sp: Species, lk: Look, hr: number, gape: number, col: (s?: string) => string, sil: boolean) {
  const { type, len: L, depth: D } = sp.bill, cu = sp.bill.curve ?? 0;
  const up = new Path2D(), lo = new Path2D();
  if (type === 'hook') {
    up.moveTo(-D * 0.15, -D * 0.58); up.bezierCurveTo(L * 0.9, -D * 0.8, L * 1.3, -D * 0.05, L * 0.78, D * 0.66); up.quadraticCurveTo(L * 0.62, D * 0.12, 0, D * 0.05); up.closePath();
    lo.moveTo(0, D * 0.08); lo.quadraticCurveTo(L * 0.55, D * 0.08, L * 0.52, D * 0.32); lo.quadraticCurveTo(L * 0.3, D * 0.68, 0, D * 0.56); lo.closePath();
  } else if (type === 'duck') {
    up.moveTo(0, -D * 0.52); up.quadraticCurveTo(L * 0.2, -D * 0.58, L * 0.9, -D * 0.24); up.quadraticCurveTo(L * 1.06, -D * 0.04, L * 0.92, D * 0.1); up.lineTo(0, D * 0.06); up.closePath();
    lo.moveTo(0, D * 0.06); lo.lineTo(L * 0.86, D * 0.1); lo.quadraticCurveTo(L * 0.5, D * 0.42, 0, D * 0.4); lo.closePath();
  } else { // heavy (currawong) or straight (magpie, raven)
    const hook = type === 'heavy' ? 0.32 : 0.06 + cu;
    up.moveTo(0, -D * 0.56); up.quadraticCurveTo(L * 0.55, -D * 0.52 + cu * D, L * 0.94, -D * 0.06 + cu * D * 1.2); up.quadraticCurveTo(L * 1.02, D * 0.06 + cu * D, L * 0.96, D * hook + cu * D); up.lineTo(L * 0.84, D * 0.04 + cu * D * 1.1); up.lineTo(0, D * 0.02); up.closePath();
    lo.moveTo(0, D * 0.02); lo.lineTo(L * 0.86, D * 0.06 + cu * D * 1.1); lo.quadraticCurveTo(L * 0.45, D * 0.5 + cu * D * 0.5, 0, D * 0.52); lo.closePath();
  }
  const tipped = (p: Path2D, base: string) => {
    c.fillStyle = col(base); c.fill(p);
    if (lk.billTip && !sil) { c.save(); c.clip(p); c.fillStyle = lk.billTip; c.fillRect(L * 0.66, -D * 2, L, D * 4); c.restore(); }
  };
  c.save(); c.translate(hr * 0.62, hr * 0.1);
  c.save(); c.rotate(gape * 0.5); tipped(lo, lk.billLo); c.restore();
  c.save(); c.rotate(-gape * 0.28); tipped(up, lk.billUp); c.restore();
  c.restore();
}

function crest(c: Ctx, sp: Species, lk: Look, hr: number, up: number, col: (s?: string) => string) {
  if (!sp.crest || !lk.crest) return;
  const n = sp.crest === 'cockatoo' ? 6 : sp.crest === 'galah' ? 5 : 4, k = sp.crest === 'cockatoo' ? 1 : sp.crest === 'galah' ? 0.55 : 0.45;
  const raise = sp.crest === 'mane' ? 0 : up;
  c.fillStyle = col(lk.crest);
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const a = lerp(Math.PI + 0.12 + f * 0.1, -Math.PI / 2 - 1.05 + f * 1.45, raise);
    const len = hr * k * lerp(1.1 + 0.45 * (1 - f), 0.85 + 0.95 * f, raise), w = hr * 0.2 * k + 0.6;
    const bx = -hr * 0.12 + f * hr * 0.3, by = -hr * 0.62;
    const tx = bx + Math.cos(a) * len, ty = by + Math.sin(a) * len;
    const bend = a + 0.5 * raise; // tips curl forward when raised
    c.beginPath(); c.moveTo(bx - Math.sin(a) * w, by + Math.cos(a) * w);
    c.quadraticCurveTo(bx + Math.cos(bend) * len * 0.6 - Math.sin(a) * w, by + Math.sin(bend) * len * 0.6 + Math.cos(a) * w, tx, ty);
    c.quadraticCurveTo(bx + Math.cos(bend) * len * 0.6 + Math.sin(a) * w, by + Math.sin(bend) * len * 0.6 - Math.cos(a) * w, bx + Math.sin(a) * w, by - Math.cos(a) * w);
    c.closePath(); c.fill();
  }
}

function patches(c: Ctx, ps: Patch[] | undefined, cx: number, cy: number, rx: number, ry: number) {
  for (const p of ps ?? []) { c.beginPath(); c.ellipse(cx + p.x * rx, cy + p.y * ry, p.rx * rx, p.ry * ry, 0, 0, TAU); c.fillStyle = p.c; c.fill(); }
}

function item(c: Ctx, kind: number, wig: number) {
  c.scale(1.7, 1.7);
  if (kind === 1) { // a curl grub: fat, pale, C-shaped, wriggling
    const b = Math.sin(wig) * 1.6;
    c.lineCap = 'round'; c.strokeStyle = '#efe2bd'; c.lineWidth = 3.4;
    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(5 + b, 2.5, 2.5 - b * 0.5, 7); c.stroke();
    c.strokeStyle = '#c9b889'; c.lineWidth = 0.6;
    for (const t of [0.3, 0.5, 0.7]) { const x = lerp(lerp(0, 5 + b, t), lerp(5 + b, 2.5 - b * 0.5, t), t), y = lerp(lerp(0, 2.5, t), lerp(2.5, 7, t), t); c.beginPath(); c.moveTo(x - 1.4, y - 0.6); c.lineTo(x + 1.4, y + 0.6); c.stroke(); }
    c.fillStyle = '#a0662c'; c.beginPath(); c.arc(2.5 - b * 0.5, 7.2, 1.5, 0, TAU); c.fill();
  } else if (kind === 2) { c.fillStyle = '#7b5228'; c.beginPath(); c.ellipse(1.2, 0.6, 2, 1.4, 0.4, 0, TAU); c.fill(); }
  else if (kind === 3) { c.fillStyle = '#d8b46a'; c.beginPath(); c.arc(1, 0.6, 1.5, 0, TAU); c.fill(); }
}

export interface DrawOpts { band?: string; sil?: string }
export function drawBird(c: Ctx, sp: Species, lk: Look, p: Pose, o: DrawOpts = {}) {
  const sil = !!o.sil, col = (s?: string) => o.sil ?? s ?? '#000';
  const rx = sp.rx * (1 + 0.1 * p.fluff), ry = sp.ry * (1 + 0.22 * p.fluff), hr = sp.hr * (1 + 0.08 * p.fluff);
  const stand = -(sp.leg * (0.92 - 0.42 * p.crouch) + p.lift);
  const hipX = -1, hipY = lerp(stand, ry * 0.32, p.swim);
  const cp = Math.cos(-p.pitch), sn = Math.sin(-p.pitch);
  const toL = (x: number, y: number): [number, number] => [hipX + cp * x - sn * y, hipY + sn * x + cp * y];
  const c0x = rx * 0.12, c0y = -ry * 0.55;
  const sx = c0x + rx * 0.42, sy = c0y - ry * 0.48; // shoulder

  c.save();
  if (p.swim > 0.05) { c.beginPath(); c.rect(-400, -400, 800, 400.5); c.clip(); }
  // legs (the near one goes in front of the body when it's holding food up to the bill)
  const legsOn = p.legs > 0.5 && p.swim < 0.5;
  const nearFoot: [number, number] = [p.fx + 1, -p.fy], farFoot: [number, number] = [p.bx - 1, -p.by];
  if (legsOn) {
    leg(c, hipX - 1.5, hipY, farFoot[0], farFoot[1], sp, lk, col, undefined, true, sil);
    if (!p.inFoot) leg(c, hipX + 1, hipY, nearFoot[0], nearFoot[1], sp, lk, col, o.band, false, sil);
  }
  // far wing and tail, in the body's frame
  c.save(); c.translate(hipX, hipY); c.rotate(-p.pitch);
  const spread = clamp(p.wing, 0, 1), farSpread = spread * p.far;
  if (farSpread > 0.04) drawWing(c, sp, lk, wingPts(sp, rx, ry, farSpread, p.flap * 0.96), sx + 3, sy - 1.5, col, true, sil);
  { // tail
    const Rx = c0x - rx * 0.88, Ry = c0y - ry * 0.02, th = Math.PI - sp.tailDroop + p.tail;
    const dx = Math.cos(th), dy = Math.sin(th), nx = -dy, ny = dx, L = sp.tailLen * (1 - 0.15 * p.swim);
    const w0 = sp.tailW0, w1 = sp.tailW1 * (1 + 0.9 * p.fan);
    const tail = new Path2D();
    tail.moveTo(Rx + nx * w0, Ry + ny * w0); tail.lineTo(Rx + dx * L + nx * w1, Ry + dy * L + ny * w1);
    tail.quadraticCurveTo(Rx + dx * (L + w1 * 0.45), Ry + dy * (L + w1 * 0.45), Rx + dx * L - nx * w1, Ry + dy * L - ny * w1);
    tail.lineTo(Rx - nx * w0, Ry - ny * w0); tail.closePath();
    c.fillStyle = col(lk.tail); c.fill(tail);
    if (!sil && (lk.tailTip || lk.tailBase)) {
      c.save(); c.clip(tail);
      const band = (t0: number, t1: number, colr: string) => { const a = L * t0, b = L * t1 + w1; poly(c, [[Rx + dx * a + nx * 30, Ry + dy * a + ny * 30], [Rx + dx * b + nx * 30, Ry + dy * b + ny * 30], [Rx + dx * b - nx * 30, Ry + dy * b - ny * 30], [Rx + dx * a - nx * 30, Ry + dy * a - ny * 30]]); c.fillStyle = colr; c.fill(); };
      if (lk.tailBase) band(-0.2, 0.34, lk.tailBase);
      if (lk.tailTip) band(0.84, 1.3, lk.tailTip);
      c.restore();
    }
  }
  c.restore();
  // neck, then head position
  const [nbx, nby] = toL(c0x + rx * 0.66, c0y - ry * 0.4);
  const nl = sp.neck * p.nExt;
  let hx = nbx + Math.cos(p.nAng) * nl, hy = nby - Math.sin(p.nAng) * nl;
  if (p.tuck > 0) { const [tx, ty] = toL(c0x + rx * 0.05, c0y - ry * 1.02); hx = lerp(hx, tx, p.tuck); hy = lerp(hy, ty, p.tuck); }
  c.lineCap = 'round';
  const nw = hr * (sp.id === 'woodduck' ? 1.15 : 1.6);
  c.strokeStyle = col(lk.neck); c.lineWidth = nw; c.beginPath(); c.moveTo(nbx, nby); c.lineTo(hx, hy); c.stroke();
  if (lk.nape && !sil) { // magpie: white hind-neck
    const ux = hx - nbx, uy = hy - nby, ul = Math.hypot(ux, uy) || 1, ox = (uy / ul) * hr * 0.42, oy = (-ux / ul) * hr * 0.42;
    c.strokeStyle = lk.nape; c.lineWidth = nw * 0.52; c.beginPath(); c.moveTo(nbx + ox * 1.2, nby + oy * 1.2); c.lineTo(hx + ox, hy + oy); c.stroke();
  }
  if (sp.id === 'raven' && !sil) { // shaggy throat hackles
    const ux = hx - nbx, uy = hy - nby, ul = Math.hypot(ux, uy) || 1, fx = (-uy / ul), fy = (ux / ul), h = 2 + 3.5 * p.hackle;
    c.fillStyle = col(lk.neck); c.beginPath(); c.moveTo(hx + fx * hr * 0.5, hy + fy * hr * 0.5);
    for (let i = 0; i <= 4; i++) { const t = i / 4, x = lerp(hx, nbx, t) + fx * hr * 0.75, y = lerp(hy, nby, t) + fy * hr * 0.75; c.lineTo(x + fx * h * (i % 2 ? 1 : 0.3), y + fy * h * (i % 2 ? 1 : 0.3) + h * 0.6); }
    c.lineTo(nbx, nby); c.closePath(); c.fill();
  }
  // body
  c.save(); c.translate(hipX, hipY); c.rotate(-p.pitch);
  c.beginPath(); c.ellipse(c0x, c0y, rx, ry, 0, 0, TAU); c.fillStyle = col(lk.body); c.fill();
  if (!sil) {
    c.save(); c.beginPath(); c.ellipse(c0x, c0y, rx, ry, 0, 0, TAU); c.clip();
    patches(c, lk.bodyPatches, c0x, c0y, rx, ry);
    if (lk.speckle) { const s = lk.speckle; c.fillStyle = s.c; for (let i = 0; i < 16; i++) { const a = i * 2.39996, r = Math.sqrt((i + 0.5) / 16); c.beginPath(); c.arc(c0x + (s.x + Math.cos(a) * r * s.rx) * rx, c0y + (s.y + Math.sin(a) * r * s.ry) * ry, 0.9, 0, TAU); c.fill(); } }
    if (lk.streaks) { c.strokeStyle = lk.streaks; c.lineWidth = 0.9; for (let i = 0; i < 22; i++) { const a = i * 2.39996, r = Math.sqrt((i + 0.5) / 22), x = c0x + Math.cos(a) * r * rx * 0.92, y = c0y + Math.sin(a) * r * ry * 0.85; c.beginPath(); c.moveTo(x + 1.6, y - 0.5); c.lineTo(x - 1.6, y + 0.5); c.stroke(); } }
    if (lk.scallop) { c.strokeStyle = lk.scallop; c.lineWidth = 1.1; for (let i = 0; i < 8; i++) { c.beginPath(); c.arc(c0x + (-0.55 + (i % 4) * 0.28) * rx, c0y + (-0.78 + Math.floor(i / 4) * 0.3) * ry, 2.6, 0.25, Math.PI - 0.25); c.stroke(); } }
    if (lk.vent) { c.beginPath(); c.ellipse(c0x - rx * 0.78, c0y + ry * 0.55, rx * 0.34, ry * 0.42, -0.3, 0, TAU); c.fillStyle = lk.vent; c.fill(); }
    if (lk.backLines) { c.strokeStyle = lk.backLines; c.lineWidth = 1.6; for (const k of [0.62, 0.4]) { c.beginPath(); c.ellipse(c0x - rx * 0.1, c0y + ry * (1 - k) * 0.2, rx * 0.8, ry * k * 1.6, 0, Math.PI * 1.15, Math.PI * 1.65); c.stroke(); } }
    if (lk.sheen) { c.globalAlpha = 0.4; c.beginPath(); c.ellipse(c0x + rx * 0.1, c0y - ry * 0.55, rx * 0.7, ry * 0.3, 0, 0, TAU); c.fillStyle = lk.sheen; c.fill(); c.globalAlpha = 1; }
    const g = c.createLinearGradient(0, c0y - ry, 0, c0y + ry); g.addColorStop(0, 'rgba(255,255,255,0.08)'); g.addColorStop(0.55, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.22)');
    c.fillStyle = g; c.fillRect(c0x - rx, c0y - ry, rx * 2, ry * 2);
    c.restore();
  }
  drawWing(c, sp, lk, wingPts(sp, rx, ry, spread, p.flap), sx, sy, col, false, sil);
  c.restore();
  if (legsOn && p.inFoot) {
    leg(c, hipX + 1, hipY, nearFoot[0], nearFoot[1], sp, lk, col, o.band, false, sil);
    if (p.hold && !sil) { c.save(); c.translate(nearFoot[0] + 1, nearFoot[1] - 2); item(c, p.hold, p.wig); c.restore(); }
  }
  // head
  c.save(); c.translate(hx, hy);
  let a = p.hAng; const back = Math.cos(a) < 0;
  if (back) { c.scale(-1, 1); a = Math.PI - a; }
  c.rotate(-a);
  crest(c, sp, lk, hr, p.crest, col);
  c.beginPath(); c.arc(0, 0, hr, 0, TAU); c.fillStyle = col(lk.head); c.fill();
  if (!sil) {
    if (lk.headPatches) { c.save(); c.beginPath(); c.arc(0, 0, hr, 0, TAU); c.clip(); patches(c, lk.headPatches, 0, 0, hr, hr); c.restore(); }
    if (lk.nape) { c.save(); c.beginPath(); c.arc(0, 0, hr, 0, TAU); c.clip(); c.beginPath(); c.ellipse(-hr * 0.95, hr * 0.15, hr * 0.42, hr * 0.85, 0.2, 0, TAU); c.fillStyle = lk.nape; c.fill(); c.restore(); }
  }
  if (lk.wattle && !sil) { c.fillStyle = lk.wattle; c.beginPath(); c.moveTo(hr * 0.05, hr * 0.55); c.quadraticCurveTo(hr * 0.5, hr * 1.1, hr * 0.12, hr * 1.35); c.quadraticCurveTo(-hr * 0.25, hr * 1.05, hr * 0.05, hr * 0.55); c.fill(); }
  bill(c, sp, lk, hr, p.gape, col, sil);
  if (!sil && p.tuck < 0.7) {
    const ex = hr * 0.3, ey = -hr * 0.2, ir = hr * (lk.iris === '#f5d63b' || lk.iris === '#f2f2f0' ? 0.23 : 0.2);
    if (lk.eyeRing) { c.beginPath(); c.arc(ex, ey, ir * 1.7, 0, TAU); c.fillStyle = lk.eyeRing; c.fill(); }
    if (p.eye > 0.45) {
      c.beginPath(); c.arc(ex, ey, ir, 0, TAU); c.fillStyle = lk.iris; c.fill();
      c.beginPath(); c.arc(ex + ir * 0.12, ey, ir * 0.5, 0, TAU); c.fillStyle = '#0a0a0a'; c.fill();
      c.beginPath(); c.arc(ex - ir * 0.25, ey - ir * 0.35, ir * 0.28, 0, TAU); c.fillStyle = 'rgba(255,255,255,0.85)'; c.fill();
    } else { c.strokeStyle = shade(lk.head, 0.55); c.lineWidth = 1; c.beginPath(); c.arc(ex, ey - ir * 0.3, ir, 0.3, Math.PI - 0.3); c.stroke(); }
  }
  if (p.hold && !p.inFoot && !sil) { c.save(); c.translate(hr * 0.62 + sp.bill.len * 0.82, hr * 0.12 + sp.bill.depth * 0.25); item(c, p.hold, p.wig); c.restore(); }
  c.restore();
  c.restore();
}

/** Where the bill tip is, in the bird's own frame (feet at 0, 0), for dust, seeds and squabbles. */
export function billTip(sp: Species, p: Pose): [number, number] {
  const rx = sp.rx, ry = sp.ry, stand = -(sp.leg * (0.92 - 0.42 * p.crouch) + p.lift), hipY = lerp(stand, ry * 0.32, p.swim);
  const cp = Math.cos(-p.pitch), sn = Math.sin(-p.pitch), x0 = rx * 0.78, y0 = -ry * 0.95;
  const nbx = -1 + cp * x0 - sn * y0, nby = hipY + sn * x0 + cp * y0, nl = sp.neck * p.nExt;
  const hx = nbx + Math.cos(p.nAng) * nl, hy = nby - Math.sin(p.nAng) * nl, L = sp.hr * 0.62 + sp.bill.len;
  return [hx + Math.cos(p.hAng) * L, hy - Math.sin(p.hAng) * L];
}
