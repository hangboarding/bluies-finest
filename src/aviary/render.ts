// Draws a frame: the painted scenery, drifting clouds, then shadows, seed, birds and the bits they kick up,
// and finally the dusk/night dimming.
import { drawBird, restPose, type Pose } from './rig';
import { windPt, FLYING, type Bird, type Bug, type Prop, type World } from './sim';
import type { Sprite, Swayer } from './scene';
import { critterDepth } from './critters';
import { drawCritter, owlEyeShine } from './critter-draw';
import type { Flyer } from './flyers';
import { drawRock } from './nature';
import { SPECIES, lookOf, type Look } from './species';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

/** The breeze for something with its own phase: a slow lean with a quicker flutter on top (about -1 … 1). */
const breeze = (w: World, ph: number) => 0.7 * Math.sin(w.t * 0.9 + ph) + 0.3 * Math.sin(w.t * 2.3 + ph * 1.7);

function clouds(c: Ctx, w: World, t: number, light: number) {
  const col = light > 0.6 ? '255,255,255' : light > 0.2 ? '255,214,190' : '150,160,190', a = light > 0.2 ? 0.55 : 0.18;
  for (let i = 0; i < 3; i++) {
    const span = w.w + 260, x = ((i * 157 + t * (4 + i * 1.5)) % span) - 130, y = w.hor * (0.18 + i * 0.17), s = 0.8 + i * 0.25;
    c.fillStyle = `rgba(${col},${a})`;
    for (const [dx, dy, r] of [[0, 0, 16], [18, -6, 20], [38, 0, 15], [20, 5, 18], [-14, 4, 11]] as const) { c.beginPath(); c.ellipse(x + dx * s, y + dy * s, r * s * 1.4, r * s * 0.75, 0, 0, TAU); c.fill(); }
  }
}

/** The little white lines of wind: drawn from tail to head, thickest in the middle, fading as they go. */
function winds(c: Ctx, w: World, light: number) {
  c.lineCap = 'round';
  for (const d of w.winds) {
    if (d.t <= 0) continue;
    const k = d.t / d.T, head = Math.min(1, k * 1.3), tail = Math.max(0, k * 1.3 - 0.45), a = (light > 0.3 ? 0.7 : 0.3) * Math.min(1, (1 - k) * 4, k * 8);
    if (head <= tail) continue;
    const n = 28; let [px, py] = windPt(d, tail);
    for (let i = 1; i <= n; i++) {
      const [x, y] = windPt(d, tail + ((head - tail) * i) / n), f = Math.sin((Math.PI * i) / n);
      c.strokeStyle = `rgba(255,255,255,${a * f})`; c.lineWidth = d.w * (0.35 + 0.85 * f);
      c.beginPath(); c.moveTo(px, py); c.lineTo(x, y); c.stroke(); px = x; py = y;
    }
  }
}

/** Specks of dust catching the light: warm by day, gold at dusk, faint and cool at night. */
function motes(c: Ctx, w: World, light: number) {
  const col = light > 0.7 ? '255,250,228' : light > 0.25 ? '255,214,150' : '205,215,255', k = light > 0.25 ? 1 : 0.45;
  for (const m of w.motes) {
    const a = k * (0.12 + 0.4 * Math.sin(w.t * 1.7 + m.ph * 3) ** 2);
    c.fillStyle = `rgba(${col},${a})`; c.beginPath(); c.arc(m.x, m.y, m.s, 0, TAU); c.fill();
  }
}

/** Tussocks along the very front, swaying in the breeze (more in a gust), in front of the birds. */
function foreground(c: Ctx, w: World) {
  const n = Math.max(6, Math.round(w.w / 34)), sway = (x: number, j: number) => Math.sin(w.t * 1.6 + x * 0.03 + j) * 1.6 + w.bendAt(x) * 6;
  c.lineWidth = 1.7;
  for (const odd of [0, 1]) { // every blade of one shade in a single stroke
    c.strokeStyle = odd ? '#4d6b2d' : '#5f8237'; c.beginPath();
    for (let i = 0; i < n; i++) {
      const h0 = Math.sin(i * 12.9898) * 43758.5453, hash = h0 - Math.floor(h0);
      if (hash < 0.35) continue;
      const x = ((i + 0.5) / n) * w.w + (hash - 0.5) * 24, y = w.h + 3, blades = 5 + Math.floor(hash * 4);
      for (let j = odd; j < blades; j += 2) {
        const bx = x + (j - blades / 2) * 2.6, len = 12 + ((hash * 97 + j * 13) % 14), lean = (j - blades / 2) * 1.8 + sway(x, j) * (len / 20);
        c.moveTo(bx, y); c.quadraticCurveTo(bx + lean * 0.3, y - len * 0.6, bx + lean, y - len);
      }
    }
    c.stroke();
  }
}

/** Trees that lean from the foot, and clumps of leaves that shift about, each in its own time, all leaning with a gust. */
function swayers(c: Ctx, w: World, list: Swayer[], dpr: number) {
  for (const v of list) {
    const s = v.s;
    if (!v.amp) { c.drawImage(s.cv, s.ox, s.oy, s.w, s.h); continue; }
    const m = breeze(w, v.ph) + 1.2 * w.bendAt(v.x);
    if (v.skew) {
      const k = (v.amp * m) / Math.max(1, v.y - s.oy);
      c.setTransform(dpr, 0, -k * dpr, dpr, v.x * dpr, v.y * dpr); c.drawImage(s.cv, s.ox - v.x, s.oy - v.y, s.w, s.h); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    } else c.drawImage(s.cv, s.ox + v.amp * (m + 0.25 * Math.sin(w.t * 5.1 + v.ph * 2.3)), s.oy + v.amp * 0.3 * Math.sin(w.t * 1.3 + v.ph), s.w, s.h);
  }
}

/** A cockatoo passing over, high and far off: flap, flap, glide. */
const flyPoses = new Map<string, Pose>(), flyLooks = new Map<string, Look>();
function flyover(c: Ctx, f: Flyer) {
  const sp = SPECIES[f.k as 'cockatoo' | 'blackcockatoo'];
  let p = flyPoses.get(f.k);
  if (!p) { p = restPose(sp); Object.assign(p, { legs: 0, wing: 1, crouch: 0, crest: 0, pitch: 0.05, nAng: 0.4, nExt: 0.9, hAng: -0.05, tail: 0, fan: 0.3, fx: -3, bx: -5, fy: 4, by: 4 }); flyPoses.set(f.k, p); }
  const lkKey = f.k + (f.female ? 'f' : 'm'); let lk = flyLooks.get(lkKey);
  if (!lk) { lk = lookOf(sp, f.female); flyLooks.set(lkKey, lk); }
  const glide = Math.sin(f.t * (f.k === 'cockatoo' ? 1.1 : 0.6) + f.t0) > (f.k === 'cockatoo' ? 0.5 : 0.7);
  p.flap = glide ? 0.14 + 0.05 * Math.sin(f.ph * 0.3) : Math.sin(f.ph);
  c.save(); c.translate(f.x, f.y); c.scale(f.s * (f.vx > 0 ? 1 : -1), f.s); drawBird(c, sp, lk, p); c.restore();
}
/** A microbat: a dark scrap with scalloped wings, flickering, its edges just catching the moonlight. */
function bat(c: Ctx, f: Flyer) {
  const s = f.s, flap = Math.sin(f.ph), x = f.x, y = f.y, span = 7 * s, tip = -flap * 4.5 * s, mid = -flap * 2 * s;
  c.fillStyle = '#0c0a0f'; c.strokeStyle = 'rgba(160,175,215,0.4)'; c.lineWidth = 0.8;
  c.beginPath();
  for (const side of [-1, 1]) {
    c.moveTo(x + side * s, y - 0.8 * s);
    c.quadraticCurveTo(x + side * span * 0.5, y + mid - 1.6 * s, x + side * span, y + tip); // leading edge out to the tip
    c.quadraticCurveTo(x + side * span * 0.78, y + tip * 0.6 + 1.3 * s, x + side * span * 0.6, y + mid * 0.8 + 1.1 * s); // scalloped trailing edge
    c.quadraticCurveTo(x + side * span * 0.35, y + mid * 0.5 + 1.9 * s, x + side * s, y + 1.4 * s);
    c.closePath();
  }
  c.ellipse(x, y + 0.2 * s, 1.3 * s, 2 * s, 0, 0, TAU);
  c.moveTo(x - 1 * s, y - 1.4 * s); c.lineTo(x - 0.6 * s, y - 2.7 * s); c.lineTo(x - 0.1 * s, y - 1.7 * s); // ears
  c.moveTo(x + 1 * s, y - 1.4 * s); c.lineTo(x + 0.6 * s, y - 2.7 * s); c.lineTo(x + 0.1 * s, y - 1.7 * s);
  c.stroke(); c.fill();
}

/** The props in depth order, worked out once for each set of props rather than every frame. */
let orderOf: Prop[] | null = null, order: number[] = [];
const live: { d: number; t: number; i: number }[] = []; // the birds and animals this frame, reused

function bird(c: Ctx, w: World, b: Bird) {
  const k = w.px(b), x = b.x + b.jit, y = b.y - b.alt;
  c.save(); c.translate(x, y);
  if (b.hang > 0.01) c.rotate(b.face * Math.PI * b.hang + b.swing);
  c.scale(k * b.face, k);
  drawBird(c, b.sp, b.lk, b.pose, { band: b.band });
  c.restore();
  if (b.pose.swim > 0.05) { // where the water meets the bird
    const rx = b.sp.rx * 1.25 * k;
    c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 1; c.beginPath(); c.ellipse(b.x, b.y, rx, rx * 0.2, 0, 0, TAU); c.stroke();
  }
}

/** One insect, drawn its own way. */
function bug(c: Ctx, w: World, g: Bug) {
  const x = g.x, y = g.y - g.a, s = w.scaleAt(g.y) * 1.3, t = w.t;
  switch (g.k) {
    case 'midge':
      c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.ellipse(x, y - 1, 2, 1 + Math.abs(Math.sin(t * 40 + g.ph)), 0, 0, TAU); c.fill();
      c.fillStyle = 'rgba(25,25,25,0.85)'; c.beginPath(); c.arc(x, y, 1.1, 0, TAU); c.fill(); break;
    case 'butterfly': case 'moth': { // two pairs of wings opening and closing (slowly while it sits)
      const open = Math.abs(Math.sin(t * (g.rest > 0 ? 2 : g.k === 'moth' ? 16 : 11) + g.ph)), ws = (g.k === 'moth' ? 3 : 3.6) * s;
      c.fillStyle = g.c; c.strokeStyle = 'rgba(40,30,20,0.6)'; c.lineWidth = 0.4;
      for (const side of [-1, 1]) {
        c.beginPath(); c.ellipse(x + side * ws * 0.55 * open, y - ws * 0.35, ws * 0.6 * open + 0.4, ws * 0.55, side * 0.5, 0, TAU); c.fill(); c.stroke();
        c.beginPath(); c.ellipse(x + side * ws * 0.4 * open, y + ws * 0.25, ws * 0.42 * open + 0.3, ws * 0.38, -side * 0.4, 0, TAU); c.fill(); c.stroke();
      }
      if (g.k === 'butterfly' && g.c !== '#f1eee4') { c.fillStyle = 'rgba(30,20,15,0.6)'; for (const side of [-1, 1]) { c.beginPath(); c.arc(x + side * ws * 0.6 * open, y - ws * 0.4, ws * 0.13, 0, TAU); c.fill(); } }
      c.strokeStyle = '#2b2118'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(x, y - ws * 0.5); c.lineTo(x, y + ws * 0.5); c.stroke(); break;
    }
    case 'dragonfly': { // a long bright body and four glassy, flickering wings
      const dir = Math.sign(g.tx - g.x) || 1, L = 7 * s;
      c.fillStyle = `rgba(230,240,255,${0.35 + 0.25 * Math.abs(Math.sin(t * 50 + g.ph))})`;
      for (const off of [-0.5, 0.5]) for (const side of [-1, 1]) { c.beginPath(); c.ellipse(x + dir * L * 0.15 * off, y + side * 2.2 * s, 3.4 * s, 0.9 * s, side * 0.2, 0, TAU); c.fill(); }
      c.strokeStyle = g.c; c.lineCap = 'round'; c.lineWidth = 1.3 * s; c.beginPath(); c.moveTo(x - dir * L * 0.6, y); c.lineTo(x + dir * L * 0.4, y); c.stroke();
      c.fillStyle = g.c; c.beginPath(); c.arc(x + dir * L * 0.45, y, 1.1 * s, 0, TAU); c.fill(); break;
    }
    case 'hopper': { // a grasshopper, legs folded, tilting as it jumps
      const tilt = g.a > 0 ? Math.atan2(-g.va, Math.abs(g.vx) + 1) * 0.5 * Math.sign(g.vx || 1) : 0, dir = Math.sign(g.vx) || 1;
      c.save(); c.translate(x, y - 1 * s); c.rotate(tilt); c.scale(dir, 1);
      c.strokeStyle = 'rgba(60,70,30,0.9)'; c.lineWidth = 0.6 * s; c.beginPath(); c.moveTo(-0.5 * s, 0); c.lineTo(-2.4 * s, -1.6 * s); c.lineTo(-3.6 * s, 0.9 * s); c.stroke();
      c.fillStyle = g.c; c.beginPath(); c.ellipse(0, 0, 3 * s, 1 * s, 0, 0, TAU); c.fill();
      c.beginPath(); c.arc(2.6 * s, -0.3 * s, 0.85 * s, 0, TAU); c.fill(); c.restore(); break;
    }
    case 'beetle': // a Christmas beetle: a glossy golden-brown oval
      c.fillStyle = 'rgba(40,30,10,0.25)'; c.beginPath(); c.ellipse(x, y + 0.6, 2.4 * s, 0.8 * s, 0, 0, TAU); c.fill();
      c.fillStyle = g.c; c.beginPath(); c.ellipse(x, y - 0.8 * s, 2.1 * s, 1.5 * s, 0, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,240,190,0.7)'; c.beginPath(); c.arc(x - 0.6 * s, y - 1.4 * s, 0.5 * s, 0, TAU); c.fill(); break;
  }
}

function rock(c: Ctx, p: Prop) { drawRock(c, p.x, p.y, p.s, p.seed); }
function prop(c: Ctx, w: World, p: Prop, s: Sprite | null, dpr: number) {
  if (!s) { if (p.k === 'rock') rock(c, p); return; }
  if (!p.flex) { c.drawImage(s.cv, p.x + s.ox, p.y + s.oy, s.w, s.h); return; }
  // swaying in the breeze, each plant in its own time, leaning into a gust as it reaches it
  const k = p.flex * (0.035 * breeze(w, p.seed * 0.37 + p.x * 0.05) + 0.05 * w.bendAt(p.x));
  c.setTransform(dpr, 0, -k * dpr, dpr, p.x * dpr, p.y * dpr); c.drawImage(s.cv, s.ox, s.oy, s.w, s.h); c.setTransform(dpr, 0, 0, dpr, 0, 0);
}
/** A painted layer, which may stop short of the bottom of the screen. */
const layer = (c: Ctx, cv: HTMLCanvasElement, dpr: number) => { if (cv.width && cv.height) c.drawImage(cv, 0, 0, cv.width / dpr, cv.height / dpr); };

export interface Layers {
  sky: HTMLCanvasElement; back: HTMLCanvasElement; land: HTMLCanvasElement; canopy: HTMLCanvasElement;
  props: (Sprite | null)[]; forest: Swayer[]; leaves: Swayer[]; dpr: number;
}
export function drawWorld(c: Ctx, w: World, L: Layers, light: number) {
  const dpr = L.dpr;
  layer(c, L.sky, dpr);
  clouds(c, w, w.t, light);
  layer(c, L.back, dpr);
  swayers(c, w, L.forest, dpr);
  for (const f of w.flyers) if (f.k !== 'bat') flyover(c, f); // high over the forest, behind the near branches
  layer(c, L.land, dpr);
  for (const g of w.bugs) if (!FLYING.has(g.k) && w.bugAwake(g)) bug(c, w, g); // on the ground
  for (const p of w.parts) if (p.k === 'ripple') {
    c.strokeStyle = `rgba(255,255,255,${0.5 * (1 - p.life / p.max)})`; c.lineWidth = 1;
    c.beginPath(); c.ellipse(p.x, p.y, p.r, p.r * 0.3, 0, 0, TAU); c.stroke();
  }
  for (const f of w.food) {
    const s = w.scaleAt(f.y) * 1.4;
    if (f.a > 0) { c.fillStyle = 'rgba(40,50,20,0.2)'; c.beginPath(); c.ellipse(f.x, f.y, 2 * s, 0.7 * s, 0, 0, TAU); c.fill(); }
    c.fillStyle = '#e6c67e'; c.strokeStyle = '#9a7a3e'; c.lineWidth = 0.5;
    c.beginPath(); c.ellipse(f.x, f.y - f.a, 1.7 * s, 1.1 * s, 0.3, 0, TAU); c.fill(); c.stroke();
  }
  for (const b of w.birds) { // shadows
    if (b.perch >= 0 || b.swim || b.pose.swim > 0.1) continue;
    const k = w.px(b), f = 1 / (1 + b.alt / 120), rx = b.sp.rx * 1.25 * k * f;
    c.fillStyle = `rgba(30,40,15,${0.24 * f})`; c.beginPath(); c.ellipse(b.x, b.y, rx, rx * 0.26, 0, 0, TAU); c.fill();
  }
  if (w.hi) for (const b of w.birds) if (b.uid === w.hi.uid && b.alt < 2) {
    const k = w.px(b), rx = b.sp.rx * 1.7 * k;
    c.globalAlpha = 0.35 + 0.2 * Math.sin(w.t * 7); c.fillStyle = b.band; c.beginPath(); c.ellipse(b.x, b.y, rx, rx * 0.3, 0, 0, TAU); c.fill(); c.globalAlpha = 1;
  }
  // birds and everything standing in the clearing, furthest first, so a bird can walk behind a bush
  // (the props are sorted once; the birds and animals, a few dozen at most, each frame, then the two merged)
  if (orderOf !== w.props || order.length !== w.props.length) { order = w.props.map((_, i) => i).sort((a, b) => w.props[a]!.y - w.props[b]!.y); orderOf = w.props; }
  let n = 0;
  const add = (d: number, t: number, i: number) => { const o = live[n] ?? (live[n] = { d: 0, t: 0, i: 0 }); o.d = d; o.t = t; o.i = i; n++; };
  for (let i = 0; i < w.birds.length; i++) add(w.depth(w.birds[i]!), 0, i);
  for (let i = 0; i < w.critters.length; i++) if (!w.critters[i]!.hidden) add(critterDepth(w, w.critters[i]!), 2, i);
  for (let i = 1; i < n; i++) { const o = live[i]!; let j = i - 1; while (j >= 0 && live[j]!.d > o.d) { live[j + 1] = live[j]!; j--; } live[j + 1] = o; }
  const one = (o: { t: number; i: number }) => (o.t === 0 ? bird(c, w, w.birds[o.i]!) : drawCritter(c, w, w.critters[o.i]!));
  let j = 0;
  for (const i of order) {
    const y = w.props[i]!.y;
    while (j < n && live[j]!.d < y) one(live[j++]!);
    prop(c, w, w.props[i]!, L.props[i] ?? null, dpr);
  }
  while (j < n) one(live[j++]!);
  layer(c, L.canopy, dpr);
  swayers(c, w, L.leaves, dpr);
  for (const g of w.bugs) if (FLYING.has(g.k) && w.bugAwake(g)) bug(c, w, g); // in the air
  for (const p of w.parts) {
    if (p.k === 'ripple') continue;
    const y = p.y - p.a, fade = Math.min(1, 2 * (1 - p.life / p.max));
    c.globalAlpha = fade; c.fillStyle = p.c; c.strokeStyle = p.c;
    if (p.k === 'grass') { c.lineWidth = 0.8; c.beginPath(); c.moveTo(p.x, y); c.lineTo(p.x + Math.cos(p.rot) * 3, y + Math.sin(p.rot) * 3); c.stroke(); }
    else if (p.k === 'leaf') { // a gum leaf: long, curved, turning over as it falls
      c.save(); c.translate(p.x, y); c.rotate(p.rot); c.scale(1, 0.35 + 0.65 * Math.abs(Math.cos(p.life * 2.3 + p.vr)));
      c.beginPath(); c.moveTo(-p.r * 1.6, 0); c.quadraticCurveTo(0, -p.r * 0.9, p.r * 1.6, 0); c.quadraticCurveTo(0, p.r * 0.5, -p.r * 1.6, 0); c.fill(); c.restore();
    }
    else if (p.k === 'feather' || p.k === 'petal' || p.k === 'husk') { c.beginPath(); c.ellipse(p.x, y, p.r, p.r * (p.k === 'feather' ? 0.38 : 0.6), p.rot, 0, TAU); c.fill(); }
    else { c.beginPath(); c.arc(p.x, y, p.r, 0, TAU); c.fill(); }
  }
  c.globalAlpha = 1;
  foreground(c, w);
  motes(c, w, light);
  winds(c, w, light);
  if (light < 0.98) { c.fillStyle = `rgba(6,12,34,${(1 - light) * 0.42})`; c.fillRect(0, 0, w.w, w.h); }
  for (const f of w.flyers) if (f.k === 'bat') bat(c, f); // dark shapes against the night sky
  for (const cr of w.critters) if (cr.k === 'owl') owlEyeShine(c, w, cr);
}
