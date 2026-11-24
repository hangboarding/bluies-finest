// The clearing: where every bird is, what it's doing, and the bits of dirt, seed, feather and water it
// kicks up. No drawing here (see render.ts), so it runs in tests too.
//
// Each bird has one action at a time (walking, pecking, pulling a grub, squabbling, perching…). An action
// sets the pose it wants each frame and says when it's finished; the bird eases towards that pose, and
// when the action ends it picks another, weighted by its species' habits.
import { lookOf, SPECIES, type Behaviour, type Look, type Species } from './species';
import { restPose, billTip, type Pose, type PoseKey } from './rig';
import type { SpeciesId } from '../lib/flock';

export type Act = Behaviour | 'faceoff' | 'flee' | 'chase' | 'perched' | 'sleep' | 'forage' | 'arrive' | 'depart' | 'startle' | 'notice' | 'eat' | 'roost';
export type SoundKind = 'song' | 'alarm' | 'squabble';

interface Flight { x0: number; y0: number; a0: number; x1: number; y1: number; a1: number; T: number; H: number; t: number; take: number; glide: boolean; away: boolean }
export interface Bird {
  id: number; sp: Species; lk: Look; uid: string; band: string; female: boolean;
  /** Where it is on the ground (screen px; y is how far forward it stands), and how high above that it is. */
  x: number; y: number; alt: number; face: number; size: number; bold: number;
  pose: Pose; want: Pose; rate: number;
  act: Act; at: number; s: any; then: Act | null; last: Act | null;
  fl: Flight | null; perch: number; swim: boolean; hang: number; hangT: number; swing: number; jit: number;
  hold: 0 | 1 | 2 | 3 | 4; blink: number; ph: number; gone: boolean; leaving: boolean;
}
export type PartKind = 'dust' | 'grass' | 'feather' | 'drop' | 'husk' | 'ripple' | 'petal' | 'leaf';
export interface Part { k: PartKind; x: number; y: number; a: number; vx: number; va: number; life: number; max: number; c: string; r: number; rot: number; vr: number }
export interface Food { x: number; y: number; a: number; va: number; left: number; age: number }
/** Insects: midges, butterflies, dragonflies over the pond and moths at night fly; grasshoppers and Christmas beetles stay on the ground. */
export type BugKind = 'midge' | 'butterfly' | 'dragonfly' | 'moth' | 'hopper' | 'beetle';
export interface Bug { k: BugKind; x: number; y: number; a: number; ph: number; dead: number; vx: number; vy: number; va: number; tx: number; ty: number; ta: number; rest: number; c: string }
export const FLYING = new Set<BugKind>(['midge', 'butterfly', 'dragonfly', 'moth']);
/** A spot on a branch. Slots are packed a bird's width apart: by day birds keep a slot between them, at night they cuddle up. */
export interface Perch { x: number; y: number; gy: number; by: Bird | null; br: number; i: number }
/** A branch to perch on: a wavering curve from the trunk out to its tip, `gy` being how far forward its tree stands. */
export interface Branch { x0: number; y0: number; c1x: number; c1y: number; c2x: number; c2y: number; x1: number; y1: number; th: number; gy: number; from: number; to: number; seed: number; wob: number; dead?: boolean }
/** The pond is a run of overlapping ellipses: from off the left edge, winding away towards the horizon. */
export interface Pool { x: number; y: number; rx: number; ry: number }
export type PropKind = 'gum' | 'fern' | 'sheoak' | 'sapling' | 'wattle' | 'teatree' | 'banksia' | 'grevillea' | 'waratah' | 'heath' | 'bracken' | 'tussock' | 'rock';
/** Something standing in the clearing, drawn in depth order with the birds. `foot` is how much ground it takes up (0: birds can stand right by it). */
export interface Prop { k: PropKind; x: number; y: number; s: number; flex: number; foot: number; seed: number }
export interface Tree { x: number; w: number; base: number; top: number; far: boolean }
/** Something in flower the honeyeaters and parrots feed at. */
export interface Flower { x: number; y: number; r: number; h: number; kind: 'grevillea' | 'waratah' }
/** A little white line of wind that loops, or curls into a spiral, and fades. */
export interface Wind { x: number; y: number; t: number; T: number; len: number; r: number; at: number; dir: number; w: number; curl: boolean }
/** A speck of dust drifting in the light. */
export interface Mote { x: number; y: number; ph: number; s: number; v: number }

/** Where a branch is at t (0 at the trunk, 1 at the tip): a curve with a little irregular waver that grows towards the tip. */
export function onBranch(B: Branch, t: number): [number, number] {
  const u = 1 - t;
  const x = u * u * u * B.x0 + 3 * u * u * t * B.c1x + 3 * u * t * t * B.c2x + t * t * t * B.x1;
  const y = u * u * u * B.y0 + 3 * u * u * t * B.c1y + 3 * u * t * t * B.c2y + t * t * t * B.y1;
  const dx = 3 * u * u * (B.c1x - B.x0) + 6 * u * t * (B.c2x - B.c1x) + 3 * t * t * (B.x1 - B.c2x);
  const dy = 3 * u * u * (B.c1y - B.y0) + 6 * u * t * (B.c2y - B.c1y) + 3 * t * t * (B.y1 - B.c2y);
  const l = Math.hypot(dx, dy) || 1, off = B.wob * (Math.sin(t * 9.3 + B.seed) * 0.6 + Math.sin(t * 23.1 + B.seed * 1.7) * 0.25) * (0.3 + t);
  return [x - (dy / l) * off, y + (dx / l) * off];
}
/** The branch's thickness (each side of its centre line) at t: tapering, and a bit knobbly. */
export const branchTh = (B: Branch, t: number) => B.th * (1 - 0.68 * t) * (1 + 0.1 * Math.sin(t * 37 + B.seed));
/** A repeatable random sequence, so the scenery is laid out the same every time. */
export function seeded(seed: number) { let s = seed >>> 0 || 1; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
/** Where a wind line is at u (0 → 1 along it). */
export function windPt(d: Wind, u: number): [number, number] {
  const wave = Math.sin(u * Math.PI * 2) * 2.5;
  if (d.curl) { // runs along, then spirals in on itself
    const s0 = d.at, x0 = d.x + d.dir * Math.min(u, s0) * d.len, y0 = d.y + Math.sin(Math.min(u, s0) * Math.PI * 2) * 2.5;
    if (u <= s0) return [x0, y0];
    const k = (u - s0) / (1 - s0), th = k * Math.PI * 3, rho = d.r * (1 - 0.65 * k);
    return [x0 + d.dir * rho * Math.sin(th), y0 - d.r + rho * Math.cos(th)];
  }
  const L = 0.24, a = clamp((u - (d.at - L / 2)) / L, 0, 1), th = a * a * (3 - 2 * a) * Math.PI * 2; // a loop in the middle
  return [d.x + d.dir * (u * d.len - d.r * Math.sin(th)), d.y - d.r * (1 - Math.cos(th)) + wave];
}

const DIRECT: PoseKey[] = ['flap', 'fx', 'fy', 'bx', 'by', 'wig', 'eye', 'hold', 'inFoot', 'legs', 'gape'];
const SMOOTH = (Object.keys(restPose(SPECIES.currawong)) as PoseKey[]).filter(k => !DIRECT.includes(k));
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const BUSY = new Set<Act>(['arrive', 'depart', 'startle']);
const AIRY = new Set<Act>(['arrive', 'depart', 'startle', 'flee', 'faceoff', 'fly', 'perch', 'perched', 'hawk']);

/** True for any of its notes playing at time t (seconds since the song started). */
export const singing = (notes: [number, number][], t: number) => notes.some(([a, e]) => t >= a && t <= e);
const songLen = (sp: Species) => sp.song[sp.song.length - 1]![1];

export class World {
  w = 360; h = 560; hor = 230; gh = 330; U = 0.56; crowd = 1; crowdT = 1;
  pools: Pool[] = [];
  trees: Tree[] = []; branches: Branch[] = []; flowers: Flower[] = []; props: Prop[] = [];
  perches: Perch[] = [];
  birds: Bird[] = []; parts: Part[] = []; food: Food[] = []; bugs: Bug[] = [];
  winds: Wind[] = []; motes: Mote[] = [];
  /** Seconds left of a gust (birds' feathers ruffle, leaves and dust blow about). */
  gust = 0; windDir = 1; private windT = 2; private leafT = 3;
  /** The species the perch slots are sized for, and the crowd size they were built at. */
  private ref: Species | null = null; private builtCrowd = 1;
  /** Things due to happen later (birds arriving one after another), with the climber they're for. */
  queue: { at: number; run: () => void; uid?: string }[] = [];
  t = 0; night = false; seq = 0;
  hi: { uid: string; until: number } | null = null;
  onSound: (b: Bird, k: SoundKind) => void = () => {};
  private rests = new Map<SpeciesId, Pose>();

  constructor(public rand: () => number = Math.random) { this.windDir = rand() < 0.75 ? 1 : -1; }
  r(a: number, b: number) { return a + this.rand() * (b - a); }

  resize(w: number, h: number) {
    const ow = this.w, oh = this.h, ohor = this.hor, ogh = this.gh;
    this.w = w; this.h = h; this.hor = Math.round(h * 0.42); this.gh = h - this.hor;
    const hor = this.hor, gh = this.gh, tw = Math.max(18, w * 0.065);
    this.U = Math.min(w, 720) / 640;
    // the pond: wide where it runs off the left edge, narrowing as it winds away towards the horizon
    const spine: [number, number, number, number][] = [[-0.08, 0.76, 0.34, 0.12], [0.17, 0.63, 0.25, 0.09], [0.34, 0.51, 0.16, 0.06], [0.45, 0.4, 0.09, 0.036], [0.52, 0.31, 0.044, 0.019]];
    this.pools = [];
    for (let i = 0; i <= 24; i++) {
      const f = (i / 24) * (spine.length - 1), j = Math.min(spine.length - 2, Math.floor(f)), t = f - j, a = spine[j]!, b = spine[j + 1]!, s = t * t * (3 - 2 * t);
      this.pools.push({ x: w * lerp(a[0], b[0], t), y: hor + gh * lerp(a[1], b[1], t), rx: Math.max(10, w * lerp(a[2], b[2], s)), ry: Math.max(4, gh * lerp(a[3], b[3], s)) });
    }
    this.trees = [
      { x: w * 0.33, w: 5, base: hor + 3, top: hor - h * 0.25, far: true },
      { x: w * 0.62, w: 7, base: hor + 4, top: hor - h * 0.31, far: true },
      { x: w * 0.83, w: 5, base: hor + 2, top: hor - h * 0.21, far: true },
      { x: w * 0.035, w: tw * 0.55, base: hor + gh * 0.07, top: -10, far: false },
      { x: w - tw * 0.15, w: tw, base: hor + gh * 0.26, top: -10, far: false },
    ];
    const X = (f: number) => w * f, Y = (f: number) => hor - h * f;
    this.branches = [
      // the far gum's: out to the left, dipping, then lifting at the tip
      { x0: X(0.62), y0: Y(0.15), c1x: X(0.57), c1y: Y(0.125), c2x: X(0.5), c2y: Y(0.14), x1: X(0.44), y1: Y(0.178), th: 2.4, gy: hor + gh * 0.01, from: 0.15, to: 0.9, seed: 1.3, wob: 1.2 },
      // the left gum's: rising off the trunk, then sagging towards the tip
      { x0: X(0.04), y0: Y(0.15), c1x: X(0.12), c1y: Y(0.205), c2x: X(0.22), c2y: Y(0.14), x1: X(0.31), y1: Y(0.165), th: 3.8, gy: hor + gh * 0.07, from: 0.12, to: 0.88, seed: 4.1, wob: 1.6 },
      // the scribbly gum's, up high: sweeping up and out
      { x0: X(1), y0: Y(0.2), c1x: X(0.9), c1y: Y(0.205), c2x: X(0.8), c2y: Y(0.255), x1: X(0.7), y1: Y(0.232), th: 4.6, gy: hor + gh * 0.2, from: 0.12, to: 0.88, seed: 2.7, wob: 1.8 },
      // and its long dead limb, sagging, with a kink
      { x0: X(1), y0: Y(0.055), c1x: X(0.85), c1y: Y(0.012), c2x: X(0.68), c2y: Y(0.095), x1: X(0.54), y1: Y(0.085), th: 5.6, gy: hor + gh * 0.2, from: 0.1, to: 0.92, seed: 7.9, wob: 2.4, dead: true },
    ];
    this.flowers = [
      { x: w * 0.8, y: hor + gh * 0.17, r: Math.max(24, w * 0.065), h: Math.max(24, w * 0.065) * 1.25, kind: 'grevillea' },
      { x: w * 0.135, y: hor + gh * 0.15, r: 9, h: 30, kind: 'waratah' },
    ];
    // everything standing in the clearing, drawn in depth order with the birds
    const P = (k: PropKind, fx: number, fy: number, s: number, flex: number, foot: number): Prop => ({ k, x: w * fx, y: hor + gh * fy, s, flex, foot, seed: Math.round(fx * 997 + fy * 131) });
    const [g, wa] = this.flowers as [Flower, Flower];
    this.props = [
      P('gum', 0.035, 0.07, tw * 0.55, 0, tw * 0.4), { ...P('gum', 0, 0.26, tw, 0, tw * 0.7), x: w - tw * 0.15 },
      P('fern', 0.22, 0.05, 1, 0.5, 6), P('fern', 0.93, 0.36, 1.3, 0.5, 8),
      P('sheoak', 0.31, 0.25, h * 0.17, 0.3, 5), P('sapling', 0.74, 0.36, h * 0.2, 0.25, 4), P('wattle', 0.88, 0.66, h * 0.14, 0.35, 10),
      P('teatree', 0.61, 0.56, 15, 0.25, 12), P('banksia', 0.5, 0.07, Math.max(16, w * 0.045), 0.15, 10),
      { ...P('grevillea', 0, 0, g.r, 0.2, g.r * 0.7), x: g.x, y: g.y }, { ...P('waratah', 0, 0, 1, 0.5, 4), x: wa.x, y: wa.y },
      P('heath', 0.39, 0.04, 1, 0.2, 0), P('heath', 0.69, 0.1, 1, 0.2, 0), P('heath', 0.57, 0.13, 1, 0.2, 0),
      P('bracken', 0.66, 0.05, 46, 0.4, 0), P('bracken', 0.72, 0.92, 36, 0.4, 0),
    ];
    const rr = seeded(77), clearOf = (x: number, y: number, d: number) => !this.inPond(x, y, 1.4) && this.props.every(p => Math.hypot(p.x - x, (p.y - y) * 2) > d);
    for (let i = 0, n = 0; i < 60 && n < 9; i++) { // tussocks dotted about
      const z = rr(), x = rr() * w, y = hor + gh * (0.12 + z * 0.84);
      if (clearOf(x, y, 30)) { this.props.push({ k: 'tussock', x, y, s: 0.6 + z * 0.9, flex: 1, foot: 0, seed: i + 5 }); n++; }
    }
    for (const e of this.pools) for (let i = 0; i < 5; i++) { // sandstone rocks round the water's edge
      const a = rr() * Math.PI * 2, x = e.x + Math.cos(a) * e.rx * 1.03, y = e.y + Math.sin(a) * e.ry * 1.1;
      if (x < -6 || x > w + 6 || this.inPond(x, y, 0.995)) continue;
      if (this.props.some(p => p.k === 'rock' && Math.hypot(p.x - x, (p.y - y) * 2) < 11)) continue;
      const big = rr() < 0.15;
      this.props.push({ k: 'rock', x, y: y + 1, s: (big ? 6 + rr() * 3 : 2.2 + rr() * 3.5) * this.scaleAt(y) * 1.4, flex: 0, foot: big ? 8 : 0, seed: i });
    }
    // keep everyone in the same place relative to the new size
    for (const b of this.birds) {
      b.x = (b.x / ow) * w;
      b.y = hor + ((b.y - ohor) / ogh) * gh;
      b.alt = (b.alt / oh) * h;
      if (b.fl) { b.fl.x1 = (b.fl.x1 / ow) * w; b.fl.x0 = (b.fl.x0 / ow) * w; }
    }
    this.buildPerches(ow);
    for (const f of this.food) { f.x = (f.x / ow) * w; f.y = hor + ((f.y - ohor) / ogh) * gh; }
    this.parts = []; this.winds = [];
    if (!this.bugs.length) for (const k of ['midge', 'midge', 'midge', 'butterfly', 'butterfly', 'dragonfly', 'dragonfly', 'moth', 'moth', 'moth', 'hopper', 'hopper', 'hopper', 'beetle', 'beetle'] as BugKind[]) this.bugs.push(this.spawnBug(k));
    else for (const g of this.bugs) Object.assign(g, this.spawnBug(g.k));
    this.motes = Array.from({ length: Math.round(w / 14) }, () => ({ x: this.rand() * w, y: this.rand() * h * 0.95, ph: this.rand() * 9, s: this.r(0.5, 1.4), v: this.r(0.5, 1.5) }));
  }

  /** Lay perch slots along every branch, a cuddled-up bird's width apart, and move anyone sitting to the nearest one. */
  private buildPerches(ow = this.w) {
    const sp = this.ref ?? SPECIES.currawong, old = this.perches, out: Perch[] = [];
    this.builtCrowd = this.crowdT;
    this.branches.forEach((B, br) => {
      const pts: { t: number; x: number; y: number; s: number }[] = [];
      let L = 0, [px, py] = onBranch(B, 0);
      for (let i = 0; i <= 48; i++) { const t = i / 48, [x, y] = onBranch(B, t); L += Math.hypot(x - px, y - py); pts.push({ t, x, y, s: L }); px = x; py = y; }
      const gap = Math.max(6, sp.rx * 1.5 * this.U * this.crowdT * sp.size * this.scaleAt(B.gy));
      let i = 0;
      for (let s = L * B.from + gap / 2; s <= L * B.to - gap / 2; s += gap) {
        const p = pts.find(q => q.s >= s) ?? pts[pts.length - 1]!;
        out.push({ x: p.x, y: p.y - branchTh(B, p.t) + 1, gy: B.gy, by: null, br, i: i++ });
      }
    });
    old.forEach((o, oi) => {
      const b = o.by; if (!b || b.gone) return;
      const x = (o.x / ow) * this.w;
      let best = -1, d = Infinity;
      out.forEach((n, ni) => { if (n.br === o.br && !n.by && Math.abs(n.x - x) < d) { d = Math.abs(n.x - x); best = ni; } });
      if (best < 0) { b.perch = -1; this.go(b, 'fly'); return; } // no room any more: fly down
      if (b.s?.pi === oi) b.s.pi = best;
      const n = out[best]!; n.by = b;
      if (b.perch === oi) { b.perch = best; b.x = n.x; b.y = n.gy; b.alt = n.gy - n.y; }
      else if (b.fl && !b.fl.away) { b.fl.x1 = n.x; b.fl.y1 = n.gy; b.fl.a1 = n.gy - n.y; }
    });
    this.perches = out;
  }

  // ---------- geometry ----------
  get top() { return this.hor + this.gh * 0.1; }
  get bottom() { return this.h - this.gh * 0.05; }
  scaleAt(y: number) { return 0.5 + 0.62 * clamp((y - this.hor) / this.gh, 0, 1); }
  /** Screen px per rig unit for this bird. */
  px(b: Bird) { return this.U * this.crowd * b.sp.size * b.size * this.scaleAt(b.y); }
  private poolAt(x: number, y: number, m = 1) { return this.pools.find(e => ((x - e.x) / (e.rx * m)) ** 2 + ((y - e.y) / (e.ry * m)) ** 2 < 1); }
  inPond(x: number, y: number, m = 1) { return !!this.poolAt(x, y, m); }
  inBounds(x: number, y: number) { return x > 14 && x < this.w - 14 && y > this.top && y < this.bottom; }
  /** Somewhere a bird can stand: in the clearing, out of the water, and not inside a bush or a trunk. */
  okGround(x: number, y: number) {
    return this.inBounds(x, y) && !this.inPond(x, y, 1.12) && !this.props.some(p => p.foot > 0 && ((x - p.x) / p.foot) ** 2 + ((y - p.y) / (p.foot * 0.45)) ** 2 < 1);
  }
  crossesPond(x0: number, y0: number, x1: number, y1: number) {
    for (let i = 1; i < 10; i++) if (this.inPond(lerp(x0, x1, i / 10), lerp(y0, y1, i / 10), 1.05)) return true;
    return false;
  }
  clampGround(x: number, y: number) {
    x = clamp(x, 18, this.w - 18); y = clamp(y, this.top + 2, this.bottom - 2);
    for (let i = 0; i < 6; i++) { // step out of the water, away from the middle of whichever part of the pond it's in
      const e = this.poolAt(x, y, 1.15); if (!e) break;
      const a = Math.atan2((y - e.y) / e.ry, (x - e.x) / e.rx);
      x = clamp(e.x + Math.cos(a) * e.rx * 1.2, 18, this.w - 18); y = clamp(e.y + Math.sin(a) * e.ry * 1.2, this.top + 2, this.bottom - 2);
    }
    if (this.inPond(x, y, 1.15)) return this.spot(null);
    return { x, y };
  }
  /** A free bit of ground: near the bird (min–max body lengths away) or anywhere, as far from the others as can be. */
  spot(b: Bird | null, min = 0, max = 0, awayX?: number) {
    let best = { x: this.w / 2, y: (this.top + this.bottom) / 2 }, score = -Infinity;
    const len = b ? 100 * this.px(b) : 0;
    for (let i = 0; i < 10; i++) {
      let x: number, y: number;
      if (b && max > 0) { const a = this.rand() * Math.PI * 2, d = this.r(min, max) * len; x = b.x + Math.cos(a) * d; y = b.y + Math.sin(a) * d * 0.55; }
      else { x = this.r(24, this.w - 24); y = this.r(this.top + 6, this.bottom - 6); }
      if (!this.okGround(x, y)) continue;
      let near = Infinity;
      for (const o of this.birds) if (o !== b && o.perch < 0 && !o.gone) near = Math.min(near, Math.hypot(o.x - x, (o.y - y) * 1.6));
      const s = Math.min(near, 160) + (awayX != null ? Math.abs(x - awayX) * 0.8 : 0) + this.rand() * 20;
      if (s > score) { score = s; best = { x, y }; }
    }
    return best;
  }
  /** A spot at the water's edge (m > 1: on the bank; m < 1: just in the shallows), at the side of a stretch of the pond near
   *  the bird, so a bird there faces the water. `cx` is the middle of that stretch, to face. */
  pondEdge(b: Bird, m: number) {
    const near = [...this.pools].filter(e => e.x > 10).sort((p, q) => Math.hypot(p.x - b.x, p.y - b.y) - Math.hypot(q.x - b.x, q.y - b.y));
    for (let i = 0; i < 16; i++) {
      const e = near[Math.floor(this.rand() * Math.min(5, near.length))]!, a = (b.x < e.x && e.x - e.rx > 16 ? Math.PI : 0) + this.r(-0.5, 0.5);
      const x = e.x + Math.cos(a) * e.rx * m, y = e.y + Math.sin(a) * e.ry * m;
      if (this.inBounds(x, y) && (m > 1 ? !this.inPond(x, y) : this.inPond(x, y))) return { x, y, cx: e.x };
    }
    const e = this.pools[8]!; return { x: e.x + e.rx * m, y: e.y, cx: e.x };
  }
  /** A point out on the water, `f` of the way from the middle of a stretch to its edge. */
  pondPoint(f: number) {
    for (let i = 0; i < 20; i++) {
      const e = this.pools[Math.floor(this.rand() * this.pools.length)]!, a = this.rand() * Math.PI * 2, r = Math.sqrt(this.rand()) * f;
      const x = e.x + Math.cos(a) * e.rx * r, y = e.y + Math.sin(a) * e.ry * r;
      if (x > 16 && x < this.w - 16) return { x, y };
    }
    const e = this.pools[10]!; return { x: e.x, y: e.y };
  }
  grounded(o: Bird) { return o.alt < 1 && o.perch < 0 && !o.swim && !o.gone && !o.leaving && !o.fl && !AIRY.has(o.act) && !BUSY.has(o.act); }
  nearest(b: Bird, ok: (o: Bird) => boolean, max: number) {
    let best: Bird | null = null, d0 = max;
    for (const o of this.birds) { if (o === b || !ok(o)) continue; const d = Math.hypot(o.x - b.x, (o.y - b.y) * 1.4); if (d < d0) { d0 = d; best = o; } }
    return best;
  }
  private taken(i: number, b: Bird) { const p = this.perches[i]; return !!p && !!p.by && p.by !== b && !p.by.gone; }
  private sameBranch(i: number, j: number) { return this.perches[j]?.br === this.perches[i]?.br; }
  /** A free perch for the day: nobody on it or right next to it. */
  freePerch(b: Bird) {
    const free = this.perches.map((_, i) => i).filter(i => !this.taken(i, b) && ![i - 1, i + 1].some(j => this.sameBranch(i, j) && this.taken(j, b)));
    return free.length ? free[Math.floor(this.rand() * free.length)]! : -1;
  }
  /** A place to roost for the night, snuggled up against whoever's already there if possible. */
  freeRoost(b: Bird) {
    let best = -1, score = -1;
    this.perches.forEach((_, i) => {
      if (this.taken(i, b)) return;
      const s = [i - 1, i + 1].filter(j => this.sameBranch(i, j) && this.taken(j, b)).length * 10 + this.rand() * 5;
      if (s > score) { score = s; best = i; }
    });
    return best;
  }
  /** The bird sitting right next to this one on its branch, if any. */
  perchNeighbour(b: Bird): Bird | null {
    const i = b.perch; if (i < 0) return null;
    for (const j of this.rand() < 0.5 ? [i - 1, i + 1] : [i + 1, i - 1]) { const o = this.perches[j]?.by; if (o && this.sameBranch(i, j) && o.perch === j && !o.gone) return o; }
    return null;
  }
  /** No room in the trees: somewhere on the ground to sleep, up against other sleepers, or at the foot of a bush or tree. */
  groundRoost(b: Bird): { x: number; y: number; face: number } {
    const beds: { x: number; y: number; face: number; k: number }[] = [];
    for (const o of this.birds) {
      if (o === b || o.gone) continue;
      if (o.act === 'sleep' && o.s.ground) beds.push({ x: o.x, y: o.y, face: o.face, k: this.px(o) });
      else if (o.act === 'roost' && (o.s.st === 'walk' || o.s.st === 'flyg')) beds.push({ x: o.s.x, y: o.s.y, face: o.s.face ?? o.face, k: this.px(o) });
    }
    const free = (x: number, y: number, gap: number) => this.okGround(x, y) && !beds.some(s => Math.abs(s.x - x) < gap * 0.7 && Math.abs(s.y - y) < gap * 0.45);
    for (const s of beds.sort(() => this.rand() - 0.5)) {
      const gap = b.sp.rx * 1.5 * s.k;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0.5, 0.55], [-0.5, 0.55], [0.5, -0.55], [-0.5, -0.55]] as const) {
        const x = s.x + dx * gap, y = s.y + dy * gap; if (free(x, y, gap)) return { x, y, face: s.face };
      }
    }
    const f = this.flowers[0], t = this.trees[4];
    const shelters = b.sp.id === 'woodduck'
      ? [this.pondEdge(b, 1.3), this.pondEdge(b, 1.3)]
      : [f && { x: f.x - f.r * 1.15, y: f.y + 5 }, f && { x: f.x + f.r * 1.15, y: f.y + 5 }, t && { x: t.x - t.w * 1.4, y: t.base + 6 }];
    for (const s of shelters.filter(Boolean).sort(() => this.rand() - 0.5) as { x: number; y: number }[]) if (free(s.x, s.y, b.sp.rx * 1.5 * this.px(b))) return { ...s, face: this.rand() < 0.5 ? 1 : -1 };
    return { ...this.spot(b, 0.3, 2), face: b.face };
  }
  depth(b: Bird) { return b.y + (b.alt > 2 && b.perch < 0 && !b.swim ? 5000 + b.y : 0); }
  /** The bill tip on screen. */
  tip(b: Bird) { const [tx, ty] = billTip(b.sp, b.pose), k = this.px(b); return { x: b.x + b.face * tx * k, y: b.y - b.alt + ty * k }; }

  // ---------- birds ----------
  private restOf(sp: Species) { let r = this.rests.get(sp.id); if (!r) this.rests.set(sp.id, r = restPose(sp)); return r; }
  add(id: SpeciesId, uid: string, band: string, how: 'place' | 'arrive') {
    const sp = SPECIES[id], female = this.rand() < (id === 'crimsonrosella' ? 0.3 : 0.45), p = this.spot(null);
    if (this.ref !== sp) { this.ref = sp; this.buildPerches(); }
    const b: Bird = {
      id: ++this.seq, sp, lk: lookOf(sp, female), uid, band, female, x: p.x, y: p.y, alt: 0, face: this.rand() < 0.5 ? 1 : -1,
      size: this.r(0.93, 1.07), bold: clamp(sp.bold + this.r(-0.2, 0.2), 0.1, 1), pose: { ...this.restOf(sp) }, want: { ...this.restOf(sp) }, rate: 9,
      act: 'idle', at: 0, s: {}, then: null, last: null, fl: null, perch: -1, swim: false, hang: 0, hangT: 0, swing: 0, jit: 0,
      hold: 0, blink: this.r(0.5, 4), ph: this.rand() * 6, gone: false, leaving: false,
    };
    this.birds.push(b);
    if (how === 'arrive') this.go(b, 'arrive');
    else { this.decide(b); b.at = this.rand() * 0.8; }
    this.setCrowd();
    return b;
  }
  /** `n` of this climber's birds fly away (a session was deleted). */
  remove(uid: string, n: number) {
    for (const b of this.birds.filter(x => x.uid === uid && !x.leaving).slice(0, n)) { b.leaving = true; if (!BUSY.has(b.act)) this.go(b, 'depart'); }
  }
  count(uid: string) { return this.birds.filter(b => b.uid === uid && !b.leaving && !b.gone).length; }
  private setCrowd() { this.crowdT = clamp(Math.sqrt(16 / Math.max(1, this.birds.length)), 0.58, 1); }
  go(b: Bird, act: Act, s: any = {}) {
    if (b.act === 'perched' && act !== 'perched') b.hangT = 0;
    b.last = b.act; b.act = act; b.at = 0; b.s = s;
  }
  faceoff(a: Bird, o: Bird) {
    const dur = this.r(1.2, 2.4);
    this.go(a, 'faceoff', { foe: o, dur, lead: 1 }); this.go(o, 'faceoff', { foe: a, dur, lead: 0 });
    this.onSound(a, 'squabble');
  }
  decide(b: Bird) {
    if (b.leaving) return this.go(b, 'depart');
    if (b.then) { const t = b.then; b.then = null; return this.go(b, t); }
    if (b.hold) return this.go(b, b.sp.acts.footfeed && (b.hold === 2 || b.hold === 3) ? 'footfeed' : 'eat', { held: 1 });
    if (b.swim) return this.go(b, 'swim');
    if (b.perch >= 0) return this.go(b, 'perched');
    const food = this.food.some(f => f.left > 0);
    // bedtime: into the trees, or the pond for some of the ducks (seed thrown in the dark still gets eaten)
    if (this.night && !food) return this.go(b, b.sp.id === 'woodduck' && this.rand() < 0.5 ? 'swim' : 'roost');
    const sp = b.sp, ws: [Act, number][] = [];
    for (const [k, v] of Object.entries(sp.acts) as [Behaviour, number][]) {
      let wt = v;
      if (k === 'hang') continue; // only from a perch
      if (k === 'pester') { wt *= b.bold; if (!this.nearest(b, o => this.grounded(o), this.w * 0.45)) wt = 0; }
      if (k === 'perch' && this.freePerch(b) < 0) wt = 0;
      if (k === 'hawk' && !this.nearestBug(b, true, this.w * 0.6)) wt = 0;
      if (k === 'hunt' && !this.nearestBug(b, false, this.w * 0.5)) wt = 0;
      if (k === 'call') wt *= sp.chatty;
      if (k === b.last) wt *= 0.4;
      ws.push([k, wt]);
    }
    if (food) ws.push(['forage', 14 * b.bold]);
    let r = this.rand() * ws.reduce((a, [, x]) => a + x, 0);
    for (const [a, x] of ws) { r -= x; if (r <= 0) return this.go(b, a); }
    this.go(b, 'idle');
  }

  // ---------- movement ----------
  stand(b: Bird) { b.want.fx = 2; b.want.bx = -2; b.want.fy = b.want.by = 0; }
  gait(b: Bird, dt: number, v: number) {
    const sp = b.sp, W = b.want;
    if (b.swim) { W.lift = 0.6 * Math.sin(this.t * 4 + b.id); return; }
    const stride = sp.leg * (sp.gait === 'waddle' ? 0.22 : 0.3);
    b.ph += ((dt * v) / (stride * 2)) * Math.PI;
    const s = Math.sin(b.ph), c = Math.cos(b.ph);
    W.fx = 2 + s * stride; W.fy = Math.max(0, c) * sp.leg * 0.2; W.bx = -2 - s * stride; W.by = Math.max(0, -c) * sp.leg * 0.2;
    b.rate = 16;
    const fs = c > 0 ? 1 : -1; // a foot comes down: now and then a puff of dust
    if (fs !== b.s.fs) { b.s.fs = fs; if (this.rand() < 0.22) this.part('dust', b.x + this.r(-3, 3), b.y, 0.5, { vx: this.r(-12, 12), va: this.r(6, 18), max: 0.45, c: '#a88d63', r: 0.9 * this.scaleAt(b.y) * 1.4 }); }
    if (sp.gait === 'waddle') { W.pitch += 0.06 * s; W.lift = 0.6 * Math.abs(s); W.tail += 0.05 * s; }
    else { W.nExt = 1 + 0.16 * Math.sin(b.ph * 2); W.lift = 0.8 * Math.abs(c); W.pitch -= 0.05; }
  }
  /** Walk (or hop, for hoppers) towards a point; true on arrival. */
  walkTo(b: Bird, tx: number, ty: number, dt: number, fast = 1): boolean {
    const dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy);
    if (Math.abs(dx) > 2) b.face = dx > 0 ? 1 : -1;
    if (b.sp.gait === 'hop' && !b.swim) return this.hopTo(b, tx, ty, dt, fast);
    const v = b.sp.walkSpeed * fast * (b.swim ? 0.55 : 1), step = v * this.px(b) * dt;
    if (d <= Math.max(step, 0.5)) { b.x = tx; b.y = ty; this.stand(b); return true; }
    b.x += (dx / d) * step; b.y += (dy / d) * step;
    this.gait(b, dt, v);
    return false;
  }
  hopTo(b: Bird, tx: number, ty: number, dt: number, fast = 1): boolean {
    const S = b.s, W = b.want, T = 0.3 / Math.sqrt(fast);
    S.hp = (S.hp ?? 0) + dt / T;
    const u = S.hp % 1, dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy);
    if (Math.abs(dx) > 2) b.face = dx > 0 ? 1 : -1;
    b.rate = 22;
    if (u < 0.18) { W.crouch = 0.5; if (d < 1) { S.hp = 0; return true; } }
    else if (u < 0.82) {
      const v = (u - 0.18) / 0.64, hopLen = b.sp.leg * 1.5 * this.px(b) * fast, step = Math.min(d, (hopLen * dt) / (T * 0.64));
      W.lift = Math.sin(Math.PI * v) * b.sp.leg * 0.6; W.crouch = 0.25; W.fx = 3; W.bx = -1; W.fy = W.by = 1; W.tail += 0.15;
      if (d > 0.01) { b.x += (dx / d) * step; b.y += (dy / d) * step; }
    } else W.crouch = 0.35;
    return false;
  }
  flyStart(b: Bird, x: number, y: number, a = 0, H?: number, away = false) {
    const d = Math.hypot(x - b.x, (y - b.y) * 1.3, a - b.alt);
    const T = clamp(d / (240 * this.U * Math.max(0.65, this.crowd)), 0.5, 2.8);
    if (b.perch >= 0) { const p = this.perches[b.perch]; if (p && p.by === b) p.by = null; b.perch = -1; }
    if (b.swim) { b.swim = false; this.splash(b.x, b.y, 6); }
    b.hangT = 0;
    b.fl = { x0: b.x, y0: b.y, a0: b.alt, x1: x, y1: y, a1: a, T, H: H ?? Math.min(130, 22 + d * 0.3), t: 0, take: b.alt < 1 ? 0.14 : 0.03, glide: b.sp.glide > 0.3 && T > 1.1, away };
  }
  /** One frame of the flight set up by flyStart; true when it's landed (or reached the target). */
  flyStep(b: Bird, dt: number): boolean {
    const f = b.fl, W = b.want;
    if (!f) return true;
    f.t += dt;
    if (f.t < f.take) { W.crouch = 0.75; W.wing = 0.4; W.flap = 0.7; W.tail += 0.2; W.pitch += 0.12; b.rate = 22; return false; }
    const u = Math.min(1, (f.t - f.take) / f.T), e = u * u * (3 - 2 * u), px = b.x;
    b.x = lerp(f.x0, f.x1, e); b.y = lerp(f.y0, f.y1, e);
    b.alt = Math.max(0, lerp(f.a0, f.a1, e) + f.H * Math.sin(Math.PI * u));
    if (Math.abs(b.x - px) > 0.02) b.face = b.x > px ? 1 : -1;
    b.ph += dt * b.sp.flapHz * Math.PI * 2;
    const gliding = f.glide && u > 0.3 && u < 0.72;
    b.rate = 14; W.legs = u < 0.08 ? 1 : 0; W.wing = 1; W.crouch = 0; W.crest = 0;
    W.flap = gliding ? 0.14 + 0.05 * Math.sin(b.ph * 0.3) : Math.sin(b.ph);
    W.pitch = 0.05 + (u < 0.3 ? 0.18 : 0); W.nAng = 0.4; W.nExt = 0.9; W.hAng = -0.05; W.tail = 0; W.fan = 0.3; W.fx = -3; W.bx = -5; W.fy = W.by = 4;
    if ((b.sp.acts.hawk || b.sp.acts.hunt) && b.alt > 6) { // an insect-eater snaps up anything it flies past
      const p = this.tip(b);
      for (const g of this.bugs) if (FLYING.has(g.k) && this.bugAwake(g) && Math.abs(p.x - g.x) < 8 && Math.abs(p.y - (g.y - g.a)) < 8 && this.rand() < 0.08) { this.eatBug(g); b.s.snapT = this.t; break; }
    }
    if (this.t - (b.s.snapT ?? -9) < 0.16) W.gape = 1;
    if (u > 0.8 && !f.away) { // flare and reach for the landing
      W.legs = 1; W.pitch = 0.6; W.flap = Math.sin(b.ph * 1.3) * 0.75 + 0.25; W.fan = 1; W.fx = 7; W.bx = 4; W.fy = W.by = 3; W.tail = 0.3;
    }
    if (u >= 1) { b.alt = Math.max(0, f.a1); b.fl = null; W.crouch = 0.5; this.stand(b); return true; }
    return false;
  }
  /** Lean the bill down to the ground (k: 0 standing, 1 bill on the ground). */
  reach(b: Bird, k: number) {
    const W = b.want, sp = b.sp, parrot = sp.bill.type === 'hook', duck = sp.id === 'woodduck';
    W.pitch = lerp(W.pitch, parrot ? 0.05 : duck ? -0.25 : -0.32, k);
    W.nAng = lerp(W.nAng, -1.15, k); W.nExt = lerp(W.nExt, duck ? 1.45 : 1.3, k);
    W.hAng = lerp(W.hAng, -1.25, k); W.crouch = lerp(W.crouch, parrot ? 0.55 : 0.25, k); W.tail = lerp(W.tail, 0.25, k);
    const [, ty] = billTip(sp, W); // sink a little further if the bill still doesn't reach
    if (ty < 0) W.lift = Math.max(W.lift + ty * k * 0.9, -sp.leg * 0.45);
  }

  // ---------- bits and pieces ----------
  part(k: PartKind, x: number, y: number, a: number, o: Partial<Part> = {}) {
    if (this.parts.length > 400) return;
    this.parts.push({ k, x, y, a, vx: 0, va: 0, life: 0, max: 0.6, c: '#8a6a45', r: 1.2, rot: 0, vr: 0, ...o });
  }
  dust(b: Bird, n: number) {
    const p = this.tip(b);
    for (let i = 0; i < n; i++) this.part('dust', p.x, b.y, Math.max(0, b.y - p.y), { vx: this.r(-25, 25), va: this.r(30, 80), max: this.r(0.4, 0.7), c: this.rand() < 0.5 ? '#8b6b46' : '#6e5436', r: this.r(0.8, 1.6) * this.scaleAt(b.y) * 1.4 });
  }
  bits(b: Bird, k: PartKind, n: number, c: string) {
    const p = this.tip(b);
    for (let i = 0; i < n; i++) this.part(k, p.x, b.y, Math.max(0, b.y - p.y), { vx: this.r(-14, 14), va: this.r(10, 40), max: this.r(0.5, 0.9), c, r: this.r(0.7, 1.3) * this.scaleAt(b.y) * 1.4, rot: this.rand() * 6, vr: this.r(-8, 8) });
  }
  feather(b: Bird) {
    const k = this.px(b);
    this.part('feather', b.x + this.r(-10, 10) * k, b.y, b.alt + (b.sp.leg + b.sp.ry) * k, { vx: this.r(-12, 12), va: this.r(5, 25), max: this.r(2, 3.5), c: this.rand() < 0.6 ? b.lk.body : b.lk.wing, r: 3.2 * this.scaleAt(b.y), rot: this.rand() * 6, vr: this.r(-3, 3) });
  }
  ripple(x: number, y: number, n = 1) { for (let i = 0; i < n; i++) this.part('ripple', x, y, 0, { max: 1.4 + i * 0.25, r: 2 + i * 3, c: '#ffffff' }); }
  splash(x: number, y: number, n: number) {
    this.ripple(x, y, 3);
    for (let i = 0; i < n; i++) this.part('drop', x + this.r(-6, 6), y, this.r(2, 8), { vx: this.r(-40, 40), va: this.r(60, 140), max: 0.8, c: '#d8ecf5', r: this.r(0.8, 1.5) });
  }
  // ---------- insects ----------
  /** Eaten: another of its kind turns up a while later. */
  eatBug(g: Bug) { g.dead = this.r(8, 20); }
  spawnBug(k: BugKind): Bug {
    const g: Bug = { k, x: 0, y: 0, a: 0, ph: this.rand() * 9, dead: 0, vx: 0, vy: 0, va: 0, tx: 0, ty: 0, ta: 0, rest: 0, c: '#262626' };
    switch (k) {
      case 'midge': { const f = this.flowers[Math.floor(this.rand() * this.flowers.length)]; g.x = (f?.x ?? this.w / 2) + this.r(-50, 50); g.y = this.r(this.top, this.bottom); g.a = this.r(25, this.h * 0.3); break; }
      case 'butterfly': g.x = this.rand() < 0.5 ? -10 : this.w + 10; g.y = this.r(this.top, this.bottom); g.a = this.r(30, 90); g.c = ['#d0812c', '#3e74d6', '#f1eee4', '#e9b632'][Math.floor(this.rand() * 4)]!; this.bugTarget(g); break;
      case 'dragonfly': { const p = this.pondPoint(0.9); g.x = p.x; g.y = p.y; g.a = this.r(10, 30); g.c = this.rand() < 0.6 ? '#2f8fd3' : '#c4392b'; this.bugTarget(g); break; }
      case 'moth': g.x = this.r(0, this.w); g.y = this.r(this.top, this.bottom); g.a = this.r(20, 120); g.c = '#d9cfb8'; this.bugTarget(g); break;
      default: { const p = this.spot(null); g.x = p.x; g.y = p.y; g.c = k === 'hopper' ? (this.rand() < 0.6 ? '#6f8f3a' : '#8a7a4a') : '#c08a2c'; g.rest = this.r(1, 5); } // grasshoppers, Christmas beetles
    }
    return g;
  }
  private bugTarget(g: Bug) {
    if (g.k === 'dragonfly') { const p = this.pondPoint(0.95); g.tx = p.x; g.ty = p.y; g.ta = this.r(6, 34); return; }
    const f = g.k === 'butterfly' && this.rand() < 0.55 ? this.flowers[Math.floor(this.rand() * this.flowers.length)] : null;
    if (f) { g.tx = f.x + this.r(-0.6, 0.6) * f.r; g.ty = f.y + 1; g.ta = f.h * this.r(0.6, 1); }
    else { g.tx = this.r(10, this.w - 10); g.ty = this.r(this.top, this.bottom); g.ta = this.r(15, g.k === 'moth' ? 140 : 100); }
  }
  /** Moths come out at night, the other fliers by day; grasshoppers and beetles are always about. */
  bugAwake(g: Bug) { return g.dead <= 0 && (g.k === 'moth' ? this.night : FLYING.has(g.k) ? !this.night : true); }
  nearestBug(b: Bird, flying: boolean, max: number) {
    let best: Bug | null = null, d0 = max;
    for (const g of this.bugs) { if (!this.bugAwake(g) || FLYING.has(g.k) !== flying) continue; const d = Math.hypot(g.x - b.x, (g.y - b.y) * 1.3, g.a - b.alt); if (d < d0) { d0 = d; best = g; } }
    return best;
  }
  /** A grasshopper springs away from a bird. */
  hopAway(g: Bug, from: Bird) { if (g.a > 0) return; g.vx = (Math.sign(g.x - from.x) || 1) * this.r(50, 90); g.vy = this.r(-14, 14); g.va = this.r(70, 120); g.a = 0.01; g.rest = this.r(2, 5); }
  private moveBugs(dt: number) {
    for (const g of this.bugs) {
      if (g.dead > 0) { g.dead -= dt; if (g.dead <= 0) Object.assign(g, this.spawnBug(g.k)); continue; }
      if (!this.bugAwake(g)) continue;
      g.ph += dt;
      if (g.k === 'midge') { // dancing about in one spot
        g.x = clamp(g.x + Math.cos(g.ph * 4) * 22 * dt + Math.sin(g.ph * 9.3) * 14 * dt, 10, this.w - 10);
        g.a = clamp(g.a + Math.sin(g.ph * 5.1) * 16 * dt, 20, this.h * 0.4);
      } else if (g.k === 'hopper') {
        if (g.a > 0) {
          g.va -= 320 * dt; g.a += g.va * dt; g.x += g.vx * dt; g.y = clamp(g.y + g.vy * dt, this.top, this.bottom);
          if (g.a <= 0) { g.a = 0; g.va = 0; if (this.inPond(g.x, g.y) || g.x < 4 || g.x > this.w - 4) Object.assign(g, this.spawnBug('hopper')); }
        } else if ((g.rest -= dt) <= 0) { g.vx = this.r(-40, 40); g.vy = this.r(-10, 10); g.va = this.r(55, 100); g.a = 0.01; g.rest = this.r(2, 7); }
      } else if (g.k === 'beetle') { // trundling through the grass
        const a = Math.sin(g.ph * 0.7) * 2.5 + g.rest, nx = g.x + Math.cos(a) * 6 * dt, ny = g.y + Math.sin(a) * 3 * dt;
        if (this.okGround(nx, ny)) { g.x = nx; g.y = ny; } else g.rest += 1.3;
      } else { // butterflies, dragonflies and moths fly to a spot, maybe settle or hover there, then off again
        if (g.rest > 0) { g.rest -= dt; if (g.k === 'dragonfly') g.a += Math.sin(g.ph * 20) * 2 * dt; if (g.rest <= 0) this.bugTarget(g); continue; }
        const sp = g.k === 'dragonfly' ? 110 : g.k === 'moth' ? 30 : 26, dx = g.tx - g.x, dy = g.ty - g.y, da = g.ta - g.a, d = Math.hypot(dx, dy, da);
        if (d < 3) { g.rest = g.k === 'dragonfly' ? this.r(0.3, 1.4) : g.k === 'butterfly' && this.rand() < 0.5 ? this.r(1, 3) : 0; if (!g.rest) this.bugTarget(g); continue; }
        const k = Math.min(1, (sp * dt) / d), wob = g.k === 'dragonfly' ? 0 : 1;
        g.x += dx * k + Math.sin(g.ph * 7) * 18 * dt * wob; g.y += dy * k; g.a = Math.max(3, g.a + da * k + Math.sin(g.ph * 11) * 22 * dt * wob);
      }
    }
  }
  private leafCol() { return ['#7d8a4c', '#a39a55', '#b78a4a', '#6f7d46'][Math.floor(this.rand() * 4)]!; }
  /** A breath of wind: a white line or two that loops or curls away; sometimes a gust that blows leaves and dust about. */
  blow(gusty = this.rand() < 0.35) {
    const d = this.windDir, n = gusty ? 2 + Math.floor(this.rand() * 2) : 1;
    const y0 = this.r(this.h * 0.06, this.h * 0.88), x0 = d > 0 ? this.r(-30, this.w * 0.45) : this.r(this.w * 0.55, this.w + 30);
    for (let i = 0; i < n; i++) this.winds.push({
      x: x0 + this.r(-20, 30) * d, y: y0 + i * this.r(10, 22) * (i % 2 ? -1 : 1), t: -i * this.r(0.12, 0.35), T: this.r(1.7, 2.5),
      len: this.r(90, 170), r: this.r(6, 12), at: this.r(0.35, 0.65), dir: d, w: this.r(1.3, 2.1), curl: this.rand() < 0.5,
    });
    if (!gusty) return;
    this.gust = 1.8;
    for (let i = 0; i < 3; i++) this.part('leaf', d > 0 ? -10 : this.w + 10, this.r(this.top, this.bottom), this.r(15, 90), { vx: d * this.r(70, 120), va: this.r(-5, 12), max: this.r(4.5, 6.5), c: this.leafCol(), r: 2.6, rot: this.rand() * 6, vr: this.r(-7, 7) });
    for (let i = 0; i < 7; i++) this.part('dust', this.r(0, this.w), this.r(this.top, this.bottom), 0, { vx: d * this.r(30, 70), va: this.r(8, 26), max: this.r(0.7, 1.1), c: '#b59c70', r: this.r(0.8, 1.5) });
  }
  /** A gum leaf lets go of a canopy and drifts down. */
  private dropLeaf() {
    const cs = [[this.w * 0.9, this.h * 0.04], [this.w * 0.04, this.h * 0.06], [this.w * 0.62, this.hor - this.h * 0.3]] as const;
    const [cx, cy] = cs[Math.floor(this.rand() * cs.length)]!, gy = this.r(this.top, this.bottom), sy = cy + this.r(0, 30);
    this.part('leaf', clamp(cx + this.r(-30, 30), 4, this.w - 4), gy, Math.max(0, gy - sy), { vx: this.windDir * this.r(4, 14), va: -this.r(3, 8), max: this.r(10, 15), c: this.leafCol(), r: 2.2 * this.scaleAt(gy) * 1.4, rot: this.rand() * 6, vr: this.r(-3, 3) });
  }

  // ---------- input ----------
  /** A tap at (x, y): startles a bird, ripples the pond, or scatters seed on the ground. */
  tap(x: number, y: number): 'bird' | 'food' | 'water' | null {
    const hit = [...this.birds].filter(b => !b.gone && !b.leaving).sort((a, b) => this.depth(b) - this.depth(a)).find(b => {
      const k = this.px(b), cx = b.x, cy = b.y - b.alt - (b.sp.leg * 0.8 + b.sp.ry) * k * (b.hang > 0.5 ? -1 : 1), r = Math.max(18, (b.sp.rx + 8) * k * 1.3);
      return (x - cx) ** 2 + ((y - cy) * 1.15) ** 2 < r * r;
    });
    if (hit) {
      this.go(hit, 'startle', { fx: x });
      for (const o of this.birds) if (o !== hit && !o.leaving && !BUSY.has(o.act) && Math.hypot(o.x - hit.x, o.y - hit.y) < 90 && this.rand() < 0.45) this.go(o, 'startle', { fx: x, delay: this.r(0.1, 0.5) });
      return 'bird';
    }
    if (y < this.top - this.gh * 0.04) return null;
    if (this.inPond(x, y, 1)) { this.ripple(x, y, 3); return 'water'; }
    const n = 6 + Math.floor(this.rand() * 4);
    for (let i = 0; i < n; i++) {
      const p = this.clampGround(x + this.r(-18, 18), y + this.r(-8, 8));
      this.food.push({ x: p.x, y: p.y, a: this.r(26, 60), va: 0, left: this.rand() < 0.3 ? 2 : 1, age: 0 });
    }
    let takers = 0;
    for (const b of [...this.birds].sort((a, c) => Math.hypot(a.x - x, a.y - y) - Math.hypot(c.x - x, c.y - y))) {
      if (b.leaving || BUSY.has(b.act) || b.act === 'forage' || b.act === 'faceoff' || takers >= 10) continue;
      const near = clamp(1.25 - Math.hypot(b.x - x, b.y - y) / (this.w * 0.75), 0.15, 1);
      if (this.rand() < near * (0.45 + b.bold * 0.6)) { this.go(b, 'forage', { delay: this.r(0, 0.6) }); takers++; }
    }
    return 'food';
  }
  /** Tapped a climber in the legend: their birds look up, hop and call. */
  highlight(uid: string) {
    this.hi = { uid, until: this.t + 3 };
    for (const b of this.birds) if (b.uid === uid && !b.leaving && !BUSY.has(b.act) && !b.fl) this.go(b, 'notice', { delay: this.r(0, 0.5) });
  }

  // ---------- time ----------
  step(dt: number) {
    dt = Math.min(dt, 0.05); this.t += dt;
    this.crowd += (this.crowdT - this.crowd) * Math.min(1, dt * 1.5);
    if (Math.abs(this.crowdT - this.builtCrowd) > 0.1) this.buildPerches();
    // wind, drifting dust and falling leaves
    this.gust = Math.max(0, this.gust - dt);
    if ((this.windT -= dt) <= 0) { this.windT = this.r(3, 7.5); this.blow(); }
    for (const d of this.winds) d.t += dt;
    this.winds = this.winds.filter(d => d.t < d.T);
    for (const m of this.motes) {
      m.ph += dt;
      m.x += (this.windDir * (4 + this.gust * 30) * m.v + Math.sin(m.ph * 0.8) * 3) * dt; m.y += Math.cos(m.ph * 0.6) * 2.5 * dt;
      if (m.x < -6) m.x = this.w + 6; else if (m.x > this.w + 6) m.x = -6;
    }
    if ((this.leafT -= dt) <= 0) { this.leafT = this.r(4, 10); this.dropLeaf(); }
    if (this.queue.length) { const due = this.queue.filter(q => q.at <= this.t); this.queue = this.queue.filter(q => q.at > this.t); due.forEach(q => q.run()); }
    for (const b of this.birds) this.update(b, dt);
    if (this.birds.some(b => b.gone)) {
      for (const p of this.perches) if (p.by?.gone) p.by = null;
      this.birds = this.birds.filter(b => !b.gone); this.setCrowd();
    }
    if (this.hi && this.t > this.hi.until) this.hi = null;
    for (const f of this.food) {
      f.age += dt;
      if (f.a > 0 || f.va > 0) { f.va -= 320 * dt; f.a += f.va * dt; if (f.a <= 0) { f.a = 0; f.va = Math.abs(f.va) > 50 ? -f.va * 0.3 : 0; } }
    }
    this.food = this.food.filter(f => f.left > 0 && f.age < 90);
    this.moveBugs(dt);
    for (const p of this.parts) {
      p.life += dt;
      if (p.k === 'ripple') { p.r += 16 * dt; continue; }
      const slow = p.k === 'feather' || p.k === 'petal' || p.k === 'leaf';
      p.va -= (slow ? 30 : 260) * dt; if (slow) p.va = Math.max(p.va, p.k === 'leaf' ? -22 : -16);
      if (slow && this.gust > 0) p.vx += this.windDir * this.gust * 40 * dt;
      p.a += p.va * dt; p.x += (p.vx + (slow && p.a > 0 ? Math.sin(p.life * 3 + p.rot) * 10 : 0)) * dt;
      if (p.a > 0 || p.k !== 'leaf') p.rot += p.vr * dt;
      if (p.a <= 0) {
        p.a = 0; p.va = 0; p.vx *= p.k === 'leaf' ? 1 - Math.min(1, dt * 3) : 0.5;
        if (p.k === 'drop') { p.life = p.max; if (this.inPond(p.x, p.y)) this.ripple(p.x, p.y); }
        if (p.k === 'leaf' && this.inPond(p.x, p.y)) p.vx *= 0.98; // floats
      }
    }
    this.parts = this.parts.filter(p => p.life < p.max);
  }

  private update(b: Bird, dt: number) {
    b.at += dt; b.jit = 0;
    Object.assign(b.want, this.restOf(b.sp));
    b.want.hold = b.hold; b.rate = 9;
    if (b.swim && !this.inPond(b.x, b.y, 1.02) && !b.fl) b.swim = false;
    const done = ACTS[b.act](this, b, dt);
    const W = b.want;
    if (b.swim) { W.swim = 1; W.legs = 0; }
    if (this.gust > 0 && !b.fl) { // a gust ruffles everyone's feathers
      const g = Math.min(1, this.gust);
      W.fluff = Math.max(W.fluff, 0.35 * g); W.tail += 0.08 * g * Math.sin(this.t * 19 + b.id);
      if (b.sp.crest === 'cockatoo' || b.sp.crest === 'galah') W.crest = Math.max(W.crest, 0.35 * g * (1 + Math.sin(this.t * 13 + b.id)) / 2);
    }
    if (W.eye > 0) { b.blink -= dt; if (b.blink < 0) { W.eye = 0; if (b.blink < -0.13) b.blink = this.r(1.5, 5.5); } }
    if (b.hold === 1 || b.hold === 4) W.wig = this.t * 9;
    const k = 1 - Math.exp(-b.rate * dt), P = b.pose as any, Wa = W as any;
    for (const key of SMOOTH) P[key] += (Wa[key] - P[key]) * k;
    for (const key of DIRECT) P[key] = Wa[key];
    b.hang += (b.hangT - b.hang) * (1 - Math.exp(-4 * dt));
    b.swing = Math.sin(this.t * 2.6 + b.id) * 0.22 * b.hang;
    if (done) this.decide(b);
  }
}

type ActFn = (w: World, b: Bird, dt: number) => boolean;
const notes = (b: Bird, t: number) => singing(b.sp.song, t);

/** What each action does, frame by frame. Returns true when it's finished. */
export const ACTS: Record<Act, ActFn> = {
  idle(w, b) {
    const S = b.s, W = b.want;
    if (!S.ok) { S.ok = 1; S.dur ??= w.r(1.2, 3.6); S.nt ??= 0; S.h ??= 0; S.n ??= 0; }
    if (b.at > S.nt) {
      S.nt = b.at + w.r(0.5, 1.4); const r = w.rand();
      S.h = w.r(-0.35, 0.3); S.n = w.r(-0.12, 0.12);
      if (r < 0.15) S.h = 0.9; // an eye on the sky
      else if (r < 0.28) { b.face = -b.face; S.turn = b.at; }
      else if (r < 0.42) S.flick = b.at;
      else if (r < 0.52 && b.sp.crest) S.crest = b.at;
    }
    W.hAng += S.h; W.nAng += S.n;
    if (S.turn != null && b.at - S.turn < 0.12) W.lift = 2.5;
    if (S.flick != null && b.at - S.flick < 0.18) W.tail += 0.35;
    if (S.crest != null && b.at - S.crest < 0.6) W.crest = 0.55;
    if (S.gapeAt != null && b.at < S.gapeAt) { W.gape = 0.6; W.crest = 1; }
    if (w.night) W.fluff = 0.5;
    return b.at > S.dur;
  },

  walk(w, b, dt) {
    const S = b.s;
    if (!S.ok) {
      S.ok = 1; const p = w.spot(b, 0.6, 3.2); S.x = p.x; S.y = p.y; S.fast = w.r(0.85, 1.2);
      if (w.crossesPond(b.x, b.y, S.x, S.y)) { w.go(b, 'fly', { x: S.x, y: S.y }); return false; }
      S.pause = w.rand() < 0.3 ? w.r(0.4, 1.2) : -1;
    }
    if (S.pause > 0 && b.at > S.pause && b.at < S.pause + 0.6) { b.want.hAng += 0.3; w.stand(b); return false; }
    return w.walkTo(b, S.x, S.y, dt, S.fast) || b.at > 12;
  },

  hop(w, b, dt) {
    const S = b.s;
    if (!S.ok) { S.ok = 1; const p = w.spot(b, 0.4, 1.4); S.x = p.x; S.y = p.y; }
    return w.hopTo(b, S.x, S.y, dt, 1) || b.at > 4;
  },

  fly(w, b, dt) {
    const S = b.s;
    if (!S.ok) { S.ok = 1; let { x, y } = S; if (x == null) ({ x, y } = w.spot(null)); w.flyStart(b, x, y, 0); }
    return w.flyStep(b, dt);
  },

  peck(w, b) {
    const S = b.s;
    if (!S.ok) { S.ok = 1; S.n = 2 + Math.floor(w.rand() * 4); S.T = w.r(0.28, 0.4); }
    const i = Math.floor(b.at / S.T), u = (b.at % S.T) / S.T;
    if (i >= S.n) return true;
    w.reach(b, u < 0.45 ? u / 0.45 : u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4); b.rate = 24;
    if (u > 0.45 && !S['p' + i]) { S['p' + i] = 1; w.dust(b, 2); }
    return false;
  },

  probe(w, b, dt) { // listen, stab, dig, and (often) heave a curl grub out of the ground
    const S = b.s, W = b.want;
    const next = (st: string, end: number) => { S.st = st; S.t = 0; S.end = end; };
    if (!S.ok) { S.ok = 1; next('listen', w.r(0.5, 1.2)); }
    S.t += dt;
    switch (S.st) {
      case 'listen': W.hAng = -0.8; W.nAng -= 0.25; W.nExt = 0.9; W.pitch -= 0.08; if (S.t > S.end) next('stab', 0.16); break;
      case 'stab': w.reach(b, Math.min(1, S.t / 0.12)); W.nExt += 0.12; b.rate = 30; if (S.t > S.end) { w.dust(b, 4); next('dig', w.r(0.7, 1.5)); } break;
      case 'dig':
        w.reach(b, 1); W.nExt += 0.15 + 0.05 * Math.sin(S.t * 30); W.hAng += 0.15 * Math.sin(S.t * 22); b.rate = 26;
        if (w.rand() < dt * 6) w.dust(b, 1);
        if (S.t > S.end) next(w.rand() < 0.62 ? 'tug' : 'shake', w.rand() < 0.62 ? 0.9 : 0.45);
        break;
      case 'tug': {
        const u = S.t / S.end, heave = Math.sin(u * Math.PI * 2) ** 2;
        w.reach(b, 1 - heave * 0.55); W.pitch += 0.25 * heave; W.lift += heave * 1.5; W.wing = 0.15 * heave; b.rate = 20;
        if (u > 0.5) b.hold = 1;
        if (w.rand() < dt * 8) w.dust(b, 1);
        if (S.t > S.end) { b.hold = 1; w.go(b, 'eat'); }
        break;
      }
      case 'shake': W.hAng += 0.4 * Math.sin(S.t * 40); if (S.t > S.end) return true; break;
    }
    return b.at > 8;
  },

  eat(w, b) { // bash a grub on the ground, then toss it back and gulp
    const S = b.s, W = b.want;
    if (!S.ok) { S.ok = 1; S.bash = b.hold === 1 ? 2 : b.hold === 4 ? 1 : 0; S.T = 0.32; }
    const bashEnd = S.bash * S.T;
    if (b.at < bashEnd) { const u = (b.at % S.T) / S.T; w.reach(b, Math.sin(u * Math.PI) * 0.8); b.rate = 26; if (u > 0.45 && u < 0.55 && w.rand() < 0.4) w.dust(b, 1); return false; }
    const t = b.at - bashEnd;
    if (t < 0.35) { W.hAng = 0.9; W.nAng += 0.25; W.gape = t > 0.15 ? 0.8 : 0.2; b.rate = 18; }
    else if (t < 0.5) { W.hAng = 0.7; W.gape = 0.9; b.hold = 0; W.hold = 0; }
    else { b.hold = 0; W.hold = 0; W.hAng = 0.3; W.nExt = 0.85 + 0.1 * Math.sin(t * 30); }
    return t > 0.9;
  },

  seed(w, b, dt) { // parrots: pick up a seed, crack it, drop the husk
    const S = b.s, W = b.want;
    if (!S.ok) { S.ok = 1; S.n = 2 + Math.floor(w.rand() * 3); S.i = 0; S.st = 'peck'; S.t = 0; }
    S.t += dt;
    if (S.st === 'peck') {
      const u = S.t / 0.4; w.reach(b, Math.sin(Math.min(1, u) * Math.PI)); b.rate = 22;
      if (u > 0.5) b.hold = 2;
      if (u >= 1) { S.st = 'chew'; S.t = 0; S.cd = w.r(0.8, 1.8); if (b.sp.acts.footfeed && w.rand() < 0.35) { w.go(b, 'footfeed', { held: 1 }); return false; } }
    } else {
      W.hAng -= 0.15; W.gape = Math.sin(S.t * 18) > 0.3 ? 0.35 : 0.05;
      if (w.rand() < dt * 5) w.bits(b, 'husk', 1, '#c9a46a');
      if (S.t > S.cd) { b.hold = 0; if (++S.i >= S.n) return true; S.st = 'peck'; S.t = 0; }
    }
    return false;
  },

  footfeed(w, b, dt) { // parrots: hold the seed up in one foot and nibble at it
    const S = b.s, W = b.want, sp = b.sp;
    if (!S.ok) { S.ok = 1; S.dur = w.r(2, 3.5); S.pick = S.held ? 0 : 0.4; }
    if (b.at < S.pick) { const u = b.at / S.pick; w.reach(b, Math.sin(u * Math.PI)); b.rate = 22; if (u > 0.5) b.hold = 2; return false; }
    b.hold = 2; W.hold = 2;
    const t = b.at - S.pick, up = Math.min(1, t / 0.35) * (t > S.dur - 0.35 ? Math.max(0, (S.dur - t) / 0.35) : 1);
    W.inFoot = up > 0.3 ? 1 : 0; W.fx = 2 + up * sp.rx * 0.55; W.fy = up * sp.leg * 1.25; W.bx = 0;
    W.nAng = lerp(W.nAng, -0.25, up); W.hAng = lerp(W.hAng, -1.05, up); W.nExt = lerp(1, 0.8, up); W.pitch += 0.08 * up;
    W.gape = up > 0.8 && Math.sin(t * 16) > 0.2 ? 0.4 : 0; b.rate = 14;
    if (up > 0.8 && w.rand() < dt * 4) w.bits(b, 'husk', 1, '#c9a46a');
    if (t > S.dur) { b.hold = 0; return true; }
    return false;
  },

  graze(w, b, dt) { // wood ducks: wander slowly, nibbling the grass
    const S = b.s, W = b.want;
    if (!S.ok) { S.ok = 1; S.dur = w.r(3, 7); S.dir = w.rand() * Math.PI * 2; }
    const v = b.sp.walkSpeed * 0.28, k = w.px(b);
    const nx = b.x + Math.cos(S.dir) * v * k * dt, ny = b.y + Math.sin(S.dir) * v * k * dt * 0.5;
    if (!w.okGround(nx, ny)) S.dir += Math.PI * 0.6;
    else { b.x = nx; b.y = ny; if (Math.abs(Math.cos(S.dir)) > 0.2) b.face = Math.cos(S.dir) > 0 ? 1 : -1; w.gait(b, dt, v); }
    w.reach(b, 0.85 + 0.15 * Math.sin(b.at * 5)); W.gape = Math.sin(b.at * 16) > 0.4 ? 0.45 : 0; b.rate = 18;
    if (w.rand() < dt * 3) w.bits(b, 'grass', 1, w.rand() < 0.5 ? '#7d9b45' : '#a8b25a');
    if (w.rand() < dt * 0.3) S.dir += w.r(-1, 1);
    return b.at > S.dur;
  },

  swim(w, b, dt) { // wood ducks: paddle about the pond, upend to dabble, then waddle out
    const S = b.s, W = b.want;
    if (!S.ok) {
      S.ok = 1; S.dur = w.r(7, 16); const p = w.pondPoint(0.55); S.x = p.x; S.y = p.y;
      if (b.swim) S.st = 'paddle';
      else if (Math.hypot(S.x - b.x, S.y - b.y) > w.w * 0.4 || b.alt > 1) { w.flyStart(b, S.x, S.y, 0); S.st = 'flyin'; }
      else S.st = 'enter';
    }
    if (S.st === 'flyin') { if (w.flyStep(b, dt)) { b.swim = true; w.splash(b.x, b.y, 8); S.st = 'paddle'; S.x = b.x; S.y = b.y; } return false; }
    if (S.st === 'enter') {
      const done = w.walkTo(b, S.x, S.y, dt, 0.9);
      if (!b.swim && w.inPond(b.x, b.y, 0.97)) { b.swim = true; w.ripple(b.x, b.y, 2); }
      if (done) S.st = 'paddle';
      return b.at > 15;
    }
    if (S.st === 'exit') {
      const done = w.walkTo(b, S.x, S.y, dt, 0.9);
      if (b.swim && !w.inPond(b.x, b.y, 0.97)) { b.swim = false; w.splash(b.x, b.y, 3); }
      if (done) { b.swim = false; b.then = 'shake'; return true; }
      return b.at > S.dur + 12;
    }
    W.swim = 1; W.legs = 0; W.pitch -= 0.05;
    if (w.night && !S.sub) { // asleep on the water, drifting a little
      W.fluff = 1; W.tuck = 1; W.eye = 0; W.hAng = Math.PI + 0.6; b.rate = 4; S.dur = b.at + w.r(4, 14);
      b.x += Math.sin(w.t * 0.3 + b.id) * 0.6 * dt;
      return false;
    }
    if (S.sub) {
      S.t += dt;
      const u = S.t / S.end, k = Math.sin(Math.min(1, u) * Math.PI);
      if (S.sub === 'dabble') { W.pitch = lerp(W.pitch, -1.25, k); W.nAng = lerp(W.nAng, -1.4, k); W.nExt = 1.3; W.hAng = lerp(W.hAng, -1.5, k); W.tail += 0.5 * k; W.fan = k; b.rate = 7; }
      else if (S.sub === 'call') { W.hAng = 0.35; W.nAng += 0.2; W.gape = notes(b, S.t) ? 0.6 : 0; }
      else { W.hAng = Math.PI + 0.55; W.nAng += 0.45; W.nExt = 0.8; W.gape = Math.sin(S.t * 17) > 0.5 ? 0.3 : 0; }
      if (u >= 1) { S.sub = null; w.ripple(b.x, b.y, 2); }
      return false;
    }
    if (w.walkTo(b, S.x, S.y, dt, 0.5)) {
      const p = w.pondPoint(0.7); S.x = p.x; S.y = p.y; const r = w.rand();
      if (r < 0.35) { S.sub = 'dabble'; S.t = 0; S.end = w.r(1.4, 2.4); }
      else if (r < 0.5) { S.sub = 'call'; S.t = 0; S.end = songLen(b.sp) + 0.3; w.onSound(b, 'song'); }
      else if (r < 0.65) { S.sub = 'preen'; S.t = 0; S.end = w.r(1.5, 3); }
    }
    S.rp = (S.rp ?? 0) + dt; if (S.rp > 0.5) { S.rp = 0; w.ripple(b.x - b.face * 6, b.y); }
    if (b.at > S.dur) { const p = w.pondEdge(b, 1.3); S.x = p.x; S.y = p.y; S.st = 'exit'; }
    return false;
  },

  drink(w, b, dt) { // stand at the water's edge, dip, and tip the head back to swallow
    const S = b.s, W = b.want;
    if (!S.ok) {
      S.ok = 1; const p = w.pondEdge(b, 1.08); S.x = p.x; S.y = p.y; S.cx = p.cx; S.n = 2 + Math.floor(w.rand() * 2);
      S.st = w.crossesPond(b.x, b.y, S.x, S.y) || b.alt > 1 ? 'fly' : 'go'; if (S.st === 'fly') w.flyStart(b, S.x, S.y, 0);
    }
    if (S.st === 'fly') { if (w.flyStep(b, dt)) { S.st = 'sip'; S.t0 = b.at; } return false; }
    if (S.st === 'go') { if (w.walkTo(b, S.x, S.y, dt, 1.1)) { S.st = 'sip'; S.t0 = b.at; } return b.at > 14; }
    b.face = S.cx > b.x ? 1 : -1;
    const t = b.at - S.t0, T = 1.1, i = Math.floor(t / T), u = (t % T) / T;
    if (i >= S.n) return true;
    if (u < 0.45) { w.reach(b, Math.min(1, u / 0.2)); W.nExt += 0.25; if (u > 0.2 && !S['r' + i]) { S['r' + i] = 1; const p = w.tip(b); w.ripple(p.x, b.y); } }
    else { W.hAng = 0.85; W.nAng += 0.3; W.gape = u < 0.6 ? 0.15 : 0; }
    b.rate = 14;
    return false;
  },

  bathe(w, b, dt) { // wade in, crouch, and thrash the wings about
    const S = b.s, W = b.want;
    if (!S.ok) {
      S.ok = 1; const p = w.pondEdge(b, 0.86), o = w.clampGround(p.x + (p.x - p.cx) * 0.3, p.y);
      S.x = p.x; S.y = p.y; S.ox = o.x; S.oy = o.y; S.dur = w.r(1.8, 3.2);
      S.st = w.crossesPond(b.x, b.y, o.x, o.y) || b.alt > 1 ? 'fly' : 'go'; if (S.st === 'fly') w.flyStart(b, o.x, o.y, 0);
    }
    if (S.st === 'fly') { if (w.flyStep(b, dt)) S.st = 'go'; return false; }
    if (S.st === 'go') { if (w.inPond(b.x, b.y)) W.swim = 0.3; if (w.walkTo(b, S.x, S.y, dt, 1)) { S.st = 'bathe'; S.t0 = b.at; } return b.at > 14; }
    if (S.st === 'bathe') {
      const t = b.at - S.t0;
      W.swim = 0.4; W.crouch = 0.6; W.wing = 0.55; W.flap = Math.sin(t * 38) * 0.5 + 0.2; W.fluff = 0.6; W.pitch -= 0.15 + 0.12 * Math.sin(t * 9); W.tail += 0.2 * Math.sin(t * 30); b.rate = 25;
      if (w.rand() < dt * 14) { const k = w.px(b); w.part('drop', b.x + w.r(-14, 14) * k, b.y, w.r(4, 14) * k, { vx: w.r(-50, 50), va: w.r(50, 120), max: 0.8, c: '#d8ecf5', r: w.r(0.8, 1.4) }); }
      if (w.rand() < dt * 3) w.ripple(b.x, b.y);
      if (t > S.dur) S.st = 'out';
      return false;
    }
    if (w.inPond(b.x, b.y)) W.swim = 0.3;
    if (w.walkTo(b, S.ox, S.oy, dt, 1)) { b.then = 'shake'; return true; }
    return b.at > 20;
  },

  nectar(w, b, dt) { // reach up into the grevillea or the waratah
    const S = b.s, W = b.want, sh: Flower = (S.f ??= w.flowers[Math.floor(w.rand() * w.flowers.length)]!);
    const off = () => sh.r * w.r(0.8, 1.05) + (sh.kind === 'waratah' ? 16 * w.px(b) : 0);
    if (!S.ok) {
      S.ok = 1; S.side = w.rand() < 0.5 ? -1 : 1; S.dur = w.r(3, 6); S.x = sh.x + S.side * off(); S.y = sh.y + w.r(3, 9);
      if (Math.hypot(S.x - b.x, S.y - b.y) > w.w * 0.35 || w.crossesPond(b.x, b.y, S.x, S.y) || b.alt > 1) { w.flyStart(b, S.x, S.y, 0); S.st = 'fly'; } else S.st = 'go';
    }
    if (S.st === 'fly') { if (w.flyStep(b, dt)) { S.st = 'feed'; S.t0 = b.at; } return false; }
    if (S.st === 'go') { if (w.walkTo(b, S.x, S.y, dt, 1.2)) { S.st = 'feed'; S.t0 = b.at; } return b.at > 14; }
    b.face = sh.x > b.x ? 1 : -1;
    const t = b.at - S.t0;
    W.pitch += 0.25; W.nAng = 1.25; W.nExt = 1.35; W.hAng = 0.75 + 0.15 * Math.sin(t * 7); W.gape = Math.sin(t * 14) > 0.5 ? 0.25 : 0; W.lift = 2 + (Math.sin(t * 1.3) > 0.7 ? 4 : 0); b.rate = 12;
    if (w.rand() < dt * 0.8) { const p = w.tip(b); w.part('petal', p.x, b.y, Math.max(0, b.y - p.y), { va: 5, max: 2.5, c: '#d8334a', r: 1.6, rot: w.rand() * 6, vr: 2 }); }
    if (t > S.dur) return true;
    if (w.rand() < dt * 0.25) { S.side = -S.side; S.x = sh.x + S.side * off(); S.st = 'go'; }
    return false;
  },

  hawk(w, b, dt) { // fly up, snap an insect out of the air (wattlebirds are best at it), and come back down
    const S = b.s, W = b.want;
    if (!S.ok) {
      S.ok = 1; const g = w.nearestBug(b, true, Infinity);
      if (!g) return true;
      S.g = g; w.flyStart(b, g.x, g.y, g.a, 14, true); S.st = 'up';
    }
    if (S.st === 'up') {
      const g: Bug = S.g; if (b.fl && w.bugAwake(g)) { b.fl.x1 = g.x; b.fl.y1 = g.y; b.fl.a1 = g.a; }
      if (w.flyStep(b, dt)) { // a dragonfly is harder to catch than a midge; a miss sends it darting off
        S.st = 'snap'; S.t0 = b.at;
        if (w.bugAwake(g)) { if (w.rand() < (g.k === 'dragonfly' ? 0.45 : b.sp.id === 'wattlebird' ? 0.9 : 0.7)) w.eatBug(g); else { g.rest = 0; g.tx = g.x + w.r(-80, 80); g.ta = g.a + w.r(20, 50); } }
      }
      return false;
    }
    if (S.st === 'snap') {
      W.legs = 0; W.wing = 1; b.ph += dt * 40; W.flap = Math.sin(b.ph); W.gape = b.at - S.t0 < 0.14 ? 1 : 0; W.hAng = 0.4; W.fan = 1;
      if (b.at - S.t0 > 0.28) {
        const pi = w.rand() < 0.4 ? w.freePerch(b) : -1;
        if (pi >= 0) { w.go(b, 'perch', { pi }); return false; }
        const p = w.spot(b, 0.5, 2.5); w.flyStart(b, p.x, p.y, 0, 10); S.st = 'down';
      }
      return false;
    }
    return w.flyStep(b, dt);
  },

  hunt(w, b, dt) { // stalk a grasshopper or a Christmas beetle, then pounce
    const S = b.s, W = b.want;
    if (!S.ok) { S.ok = 1; S.g = w.nearestBug(b, false, w.w * 0.5); S.tries = 0; if (!S.g) return true; }
    const g: Bug = S.g;
    if (!w.bugAwake(g) || b.at > 10) return true;
    const k = w.px(b), reach = 30 * k, dir = g.x >= b.x ? 1 : -1;
    if (S.st !== 'pounce') {
      W.pitch -= 0.15; W.nAng -= 0.35; W.nExt = 1.2; W.hAng = -0.6; W.tail += 0.1; // head low and forward, creeping up
      const d = Math.hypot(g.x - b.x, g.y - b.y);
      if (g.k === 'hopper' && d < 48 * k + 10 && !S.spooked) { S.spooked = 1; if (w.rand() < 0.5) w.hopAway(g, b); }
      const p = w.clampGround(g.x - dir * reach, g.y);
      if (w.walkTo(b, p.x, p.y, dt, g.k === 'hopper' ? 1.5 : 1.05) && g.a < 1) { S.st = 'pounce'; S.t0 = b.at; b.face = dir; S.gx = g.x; S.gy = g.y; }
      return false;
    }
    const t = b.at - S.t0;
    w.reach(b, Math.min(1, t / 0.12)); if (t < 0.15) W.lift += 3; b.rate = 30;
    if (t > 0.14 && !S.bit) {
      S.bit = 1;
      if (w.bugAwake(g) && g.a < 2 && Math.hypot(g.x - S.gx, g.y - S.gy) < 6 && w.rand() < (g.k === 'hopper' ? 0.65 : 0.9)) { w.eatBug(g); b.hold = 4; w.go(b, 'eat'); return false; }
      w.dust(b, 2); if (g.k === 'hopper') w.hopAway(g, b);
    }
    if (t > 0.45) { if (++S.tries > 2) return true; S.st = 'stalk'; S.bit = 0; S.spooked = 0; }
    return false;
  },

  call(w, b) {
    const S = b.s, W = b.want, id = b.sp.id;
    if (!S.ok) {
      S.ok = 1; S.d = S.delay ?? 0;
      if (id === 'magpie' && !S.delay) // magpies carol together
        for (const o of w.birds) if (o !== b && o.sp.id === 'magpie' && w.grounded(o) && o.act !== 'call' && Math.hypot(o.x - b.x, o.y - b.y) < w.w * 0.4 && w.rand() < 0.55) w.go(o, 'call', { delay: w.r(0.2, 0.9) });
    }
    if (b.at < S.d) return false;
    if (!S.sang) { S.sang = 1; w.onSound(b, 'song'); }
    const t = b.at - S.d, on = notes(b, t);
    W.gape = on ? 0.55 + 0.35 * Math.abs(Math.sin(t * 25)) : 0; b.rate = 16;
    switch (id) {
      case 'currawong': W.hAng = 0.3; W.nAng += 0.15; if (on) W.tail += 0.15; break;
      case 'magpie': W.hAng = 1.0; W.nAng = 1.45; W.pitch += 0.2; W.nExt = 1.15; break;
      case 'raven': W.pitch = 0; W.nAng = 0.35; W.hAng = on ? -0.4 : -0.2; W.hackle = 1; W.wing = 0.12; W.flap = -0.5; break;
      case 'cockatoo': W.crest = 1; W.wing = 0.3; W.flap = 0.55; W.hAng = 0.2; W.nAng += 0.1 * Math.sin(t * 8); break;
      case 'galah': W.crest = 0.9; W.hAng = 0.1 + 0.15 * Math.sin(t * 9); W.nAng += 0.15 * Math.sin(t * 9); break;
      case 'woodduck': W.hAng = 0.35; W.nAng += 0.2; W.nExt = 1.1; break;
      case 'wattlebird': W.hAng = on ? 0.5 : 0.2; W.nAng += on ? 0.25 : 0; if (on) W.tail += 0.25; break;
      default: W.hAng = 0.35; W.tail += 0.15 * Math.sin(t * 12); // rosellas, king parrots
    }
    return t > songLen(b.sp) + 0.4;
  },

  preen(w, b, dt) {
    const S = b.s, W = b.want;
    if (!S.ok) { S.ok = 1; S.dur = w.r(2, 4.5); S.nt = 0; }
    if (b.at > S.nt) { S.nt = b.at + w.r(0.7, 1.5); S.spot = Math.floor(w.rand() * 3); }
    if (S.spot === 0) { W.hAng = Math.PI + 0.55; W.nAng += 0.45; W.nExt = 0.8; W.tuck = 0.25; } // back
    else if (S.spot === 1) { W.hAng = -1.45; W.nAng -= 0.55; W.nExt = 0.65; } // breast
    else { W.hAng = Math.PI + 1.05; W.nAng += 0.2; W.nExt = 0.75; W.wing = 0.3; W.flap = 0.35; W.far = 0; } // under the wing
    W.hAng += 0.12 * Math.sin(b.at * 21); W.gape = Math.sin(b.at * 17) > 0.5 ? 0.3 : 0; W.fluff = 0.35; b.rate = 10;
    if (w.rand() < dt * 0.4) w.feather(b);
    return b.at > S.dur;
  },

  stretch(_w, b) { // one wing and leg out behind, then both wings up over the back
    const t = b.at, W = b.want;
    if (t < 1) { const k = Math.sin(t * Math.PI); W.wing = 0.85 * k; W.flap = -0.55; W.far = 0; W.fx = 2 - 9 * k; W.fy = 3 * k; W.fan = k; W.tail -= 0.1 * k; b.rate = 8; }
    else if (t < 1.9) { const k = Math.sin(((t - 1) / 0.9) * Math.PI); W.wing = 0.8 * k; W.flap = 0.9; W.crouch = 0.25 * k; W.nAng -= 0.2 * k; W.fan = 0.5 * k; b.rate = 8; }
    return t > 2.1;
  },

  shake(w, b, dt) {
    const t = b.at, W = b.want;
    if (t < 0.6) { W.fluff = 1; b.jit = Math.sin(t * 90) * 1.2; W.tail += 0.25 * Math.sin(t * 60); W.wing = 0.12; if (w.rand() < dt * 3) w.feather(b); }
    b.rate = 20;
    return t > 1;
  },

  pester(w, b, dt) { // go and annoy someone: snatch their food, or start something
    const S = b.s, W = b.want;
    if (!S.ok) { S.ok = 1; S.tg = w.nearest(b, o => w.grounded(o), w.w * 0.45); if (!S.tg) return true; }
    const o: Bird = S.tg;
    if (!w.grounded(o) && S.st !== 'act') return true;
    const gap = 28 * (w.px(b) + w.px(o)), side = b.x < o.x ? -1 : 1;
    if (S.st !== 'act') {
      W.pitch -= 0.12; W.nAng -= 0.2; W.tail += 0.15;
      if (w.walkTo(b, o.x + side * gap, o.y + 0.5, dt, 1.7)) { S.st = 'act'; S.t0 = b.at; b.face = o.x > b.x ? 1 : -1; }
      return b.at > 5;
    }
    const t = b.at - S.t0;
    W.nExt = 1.4; W.nAng = 0.1; W.hAng = -0.2; W.pitch -= 0.1; W.gape = 0.6; W.crest = 1; W.wing = 0.25; W.flap = 0.6; b.rate = 22;
    if (t < 0.22) return false;
    if (!w.grounded(o) && o.act !== 'idle') return true;
    if (o.hold) { // a grab for their grub or seed
      if (w.rand() < 0.55) { b.hold = o.hold; o.hold = 0; w.go(o, 'flee', { from: b }); w.onSound(o, 'alarm'); w.go(b, 'flee', { from: o }); return false; }
      w.go(o, 'flee', { from: b }); return true;
    }
    const r = w.rand();
    if (r < 0.45) { w.go(o, 'flee', { from: b }); w.onSound(o, 'alarm'); if (w.rand() < 0.4) b.then = 'call'; return true; }
    if (r < 0.82) { w.faceoff(b, o); return false; }
    o.face = b.x > o.x ? 1 : -1; w.go(o, 'idle', { dur: 1.2, nt: 9, h: 0, n: 0, gapeAt: 0.5 }); // stood its ground; the pest wanders off
    return true;
  },

  faceoff(w, b, dt) { // wings up, bills open, a lot of bouncing and shouting
    const S = b.s, W = b.want, o: Bird = S.foe;
    if (!o || o.gone || (o.act !== 'faceoff' && b.at < S.dur)) return true;
    b.face = o.x > b.x ? 1 : -1;
    const beat = Math.sin(b.at * 9 + (S.lead ? 0 : 1.6));
    W.wing = 0.7; W.flap = 0.55 + 0.35 * beat; W.gape = 0.5 + 0.3 * Math.max(0, beat); W.crest = 1; W.fan = 1; W.tail += 0.2; W.fluff = 0.5;
    W.lift = Math.max(0, beat) * 3; W.pitch += 0.15; W.nAng -= 0.1; W.hAng = -0.1 + 0.2 * beat; W.nExt = 1 + 0.35 * Math.max(0, -beat);
    b.rate = 22;
    const gap = 30 * (w.px(b) + w.px(o)), d = Math.abs(o.x - b.x);
    if (d < gap * 0.8) b.x = clamp(b.x - b.face * 20 * dt, 16, w.w - 16); else if (d > gap * 1.3) b.x += b.face * 20 * dt;
    b.y += (o.y - b.y) * dt * 1.5;
    if (w.rand() < dt * 4) w.feather(b);
    if (w.rand() < dt * 0.8) w.onSound(b, 'squabble');
    if (b.at > S.dur) {
      if (!S.lead) return b.at > S.dur + 0.5;
      const lose = w.rand() < 0.5 ? b : o, win = lose === b ? o : b;
      w.go(lose, 'flee', { from: win }); w.onSound(lose, 'alarm'); w.go(win, 'chase', { tg: lose });
    }
    return false;
  },

  flee(w, b, dt) {
    const S = b.s, W = b.want, f: Bird | undefined = S.from;
    if (!S.ok) {
      S.ok = 1; const ax = f ? Math.sign(b.x - f.x) || 1 : w.rand() < 0.5 ? -1 : 1, len = 100 * w.px(b);
      const p = w.clampGround(b.x + ax * w.r(1.2, 2.4) * len, b.y + w.r(-0.6, 0.6) * len * 0.6);
      if (w.rand() < 0.5 || w.crossesPond(b.x, b.y, p.x, p.y) || b.alt > 1) { w.flyStart(b, p.x, p.y, 0, w.r(12, 30)); S.fly = 1; } else { S.x = p.x; S.y = p.y; }
    }
    if (S.fly) return w.flyStep(b, dt);
    W.wing = 0.45; W.flap = Math.sin(b.at * 30) * 0.6; W.pitch -= 0.1;
    return w.walkTo(b, S.x, S.y, dt, 2.2) || b.at > 3;
  },

  chase(w, b, dt) {
    const S = b.s, W = b.want, o: Bird = S.tg;
    if (!o || o.gone) return true;
    W.pitch -= 0.15; W.wing = 0.3; W.flap = Math.sin(b.at * 25) * 0.4;
    const p = w.clampGround(o.x, o.y), done = w.walkTo(b, p.x, p.y, dt, 2.2);
    if (b.at > 1.1 || done) { if (b.sp.id === 'magpie' || w.rand() < 0.3) b.then = 'call'; return true; }
    return false;
  },

  perch(w, b, dt) {
    const S = b.s;
    if (!S.ok) {
      S.ok = 1; const i = S.pi ?? w.freePerch(b); if (i < 0) return true;
      S.pi = i; const p = w.perches[i]!; p.by = b; w.flyStart(b, p.x, p.gy, p.gy - p.y); w.perches[i]!.by = b;
    }
    if (w.flyStep(b, dt)) { b.perch = S.pi; w.go(b, 'perched'); }
    return false;
  },

  perched(w, b, dt) { // sit on the branch: look about, preen, call, and (galahs, cockies) hang upside down
    const S = b.s, W = b.want;
    if (!S.ok) { S.ok = 1; S.dur = w.r(5, 14); S.nt = 0; S.sub = 'look'; S.t = 0; }
    if (b.perch < 0) return true;
    if (w.night) S.dur = Math.max(S.dur, b.at + w.r(2, 14)); // roosting: stay put till morning, then wake one by one
    W.crouch = 0.35; W.fx = 1; W.bx = -1; W.fy = W.by = 0; W.tail -= 0.1;
    const nb = w.perchNeighbour(b);
    if (b.at > S.nt) {
      S.nt = b.at + w.r(0.8, 2.4); S.t = 0; const r = w.rand();
      if (w.night) S.sub = nb && r < 0.14 ? 'allopreen' : r < 0.85 ? 'sleep' : 'look';
      else S.sub = r < 0.4 ? 'look' : r < 0.55 ? 'preen' : nb && r < 0.62 ? 'allopreen' : r < 0.72 ? 'call' : b.sp.acts.hang && r < 0.95 ? 'hang' : 'flap';
      if (S.sub === 'sleep') S.nt = b.at + w.r(4, 12);
      if (S.sub === 'call') { w.onSound(b, 'song'); S.nt = b.at + songLen(b.sp) + 0.4; }
      if (S.sub === 'hang') S.nt = b.at + w.r(2.5, 4.5);
      if (S.sub === 'allopreen' && nb) { b.face = nb.x > b.x ? 1 : -1; S.nt = b.at + w.r(1.5, 3); }
      S.h = w.r(-0.35, 0.35); if (S.sub === 'look' && !w.night && w.rand() < 0.25) b.face = -b.face;
    }
    S.t += dt; b.hangT = S.sub === 'hang' ? 1 : 0;
    switch (S.sub) {
      case 'look': W.hAng += S.h; break;
      case 'preen': W.hAng = Math.PI + 0.55 + 0.12 * Math.sin(S.t * 21); W.nAng += 0.45; W.nExt = 0.8; W.tuck = 0.25; break;
      case 'call': W.gape = notes(b, S.t) ? 0.7 : 0; W.hAng = 0.35; W.crest = 0.8; break;
      case 'hang': W.crest = 0.8; if (Math.sin(S.t * 2) > 0.6) { W.wing = 0.8; W.flap = Math.sin(S.t * 28); } W.gape = S.t % 1.3 < 0.15 ? 0.5 : 0; break;
      case 'flap': if (S.t < 0.7) { W.wing = 1; W.flap = Math.sin(S.t * 30); } break;
      case 'allopreen': // nibble the neighbour's neck feathers; they bow their head for it
        if (!nb) { S.nt = 0; break; }
        b.face = nb.x > b.x ? 1 : -1; W.nAng = 0.5; W.nExt = 1.4; W.hAng = -0.55 + 0.1 * Math.sin(S.t * 20); W.gape = Math.sin(S.t * 17) > 0.4 ? 0.3 : 0; W.fluff = 0.5;
        if (nb.act === 'perched') nb.s.preened = w.t;
        break;
      case 'sleep': W.fluff = 1; W.tuck = 1; W.eye = 0; W.hAng = Math.PI + 0.6; W.crouch = 0.6; b.rate = 4; break;
    }
    if (w.t - (S.preened ?? -9) < 0.4) { W.tuck = 0; W.hAng = -0.6; W.nAng -= 0.3; W.eye = 0; W.fluff = Math.max(W.fluff, 0.7); }
    if (w.night) W.fluff = Math.max(W.fluff, 0.75);
    if (b.at > S.dur && b.hang < 0.05) { const p = w.spot(null); w.go(b, 'fly', { x: p.x, y: p.y }); }
    return false;
  },

  roost(w, b, dt) { // bedtime: a branch, cuddled up with the others, or the ground if the trees are full
    const S = b.s;
    if (!S.ok) {
      S.ok = 1;
      if (b.perch >= 0) { w.go(b, 'perched'); return false; }
      const i = b.sp.id === 'woodduck' ? -1 : w.freeRoost(b);
      if (i >= 0) { const p = w.perches[i]!; p.by = b; S.pi = i; w.flyStart(b, p.x, p.gy, p.gy - p.y); S.st = 'fly'; }
      else {
        const g = w.groundRoost(b); S.x = g.x; S.y = g.y; S.face = g.face;
        S.st = w.crossesPond(b.x, b.y, g.x, g.y) || Math.hypot(g.x - b.x, g.y - b.y) > w.w * 0.45 || b.alt > 1 || b.swim ? 'flyg' : 'walk';
        if (S.st === 'flyg') w.flyStart(b, g.x, g.y, 0);
      }
    }
    if (S.st === 'fly') { if (w.flyStep(b, dt)) { b.perch = S.pi; const nb = w.perchNeighbour(b); if (nb) b.face = nb.face; w.go(b, 'perched'); } return false; }
    const bed = () => { b.face = S.face ?? b.face; w.go(b, 'sleep', { ground: 1 }); };
    if (S.st === 'flyg') { if (w.flyStep(b, dt)) bed(); return false; }
    if (w.walkTo(b, S.x, S.y, dt, 0.8)) { bed(); return false; }
    return b.at > 20;
  },

  dance(w, b) { // cockatoos and galahs: bob to a beat only they can hear
    const S = b.s, W = b.want;
    if (!S.ok) { S.ok = 1; S.dur = w.r(3, 5.5); S.bps = w.r(1.8, 2.4); }
    const ph = b.at * S.bps * Math.PI * 2, beat = Math.sin(ph), left = Math.sin(ph / 2) > 0;
    W.nAng += 0.3 * beat; W.hAng += 0.25 * beat; W.crest = 0.5 + 0.5 * Math.max(0, beat); W.pitch += 0.06 * Math.sin(ph / 2);
    W.fy = left ? 3 * Math.max(0, beat) : 0; W.by = left ? 0 : 3 * Math.max(0, beat); W.wing = 0.15 + 0.15 * Math.max(0, beat); W.flap = 0.4; b.rate = 18;
    return b.at > S.dur;
  },

  sleep(w, b) { // fluffed up, head tucked in, with a peek out now and then
    const S = b.s, W = b.want, sp = b.sp;
    if (!S.ok) { S.ok = 1; S.dur = w.r(6, 16); S.peek = w.r(3, 8); }
    if (w.night) S.dur = Math.max(S.dur, b.at + w.r(1, 9)); // till morning
    W.fluff = 1; W.tuck = 1; W.eye = 0; W.crouch = 0.4; W.hAng = Math.PI + 0.6; b.rate = 4;
    if (S.ground) { W.legs = 0; W.crouch = 1; W.lift = 0.42 * sp.ry - 0.5 * sp.leg; } // sitting down on its legs
    if (b.at > S.peek + 1.2) S.peek = b.at + w.r(4, 12);
    else if (b.at > S.peek) { W.tuck = 0; W.eye = 1; W.hAng = 0.05; }
    return b.at > S.dur;
  },

  forage(w, b, dt) { // someone threw seed: get there first
    const S = b.s, W = b.want;
    if (b.at < (S.delay ?? 0)) { W.hAng = 0.4; return false; }
    let f: Food | undefined = S.f;
    if (!f || f.left <= 0) {
      let d0 = Infinity; f = undefined;
      for (const x of w.food) { const d = Math.hypot(x.x - b.x, (x.y - b.y) * 1.3); if (x.left > 0 && d < d0) { d0 = d; f = x; } }
      if (!f || (S.tries = (S.tries ?? 0) + 1) > 6) return true;
      S.f = f; S.st = 'go';
      if (d0 > w.w * 0.4 || w.crossesPond(b.x, b.y, f.x, f.y) || b.alt > 1 || b.swim) { const p = w.clampGround(f.x - (f.x > b.x ? 1 : -1) * 30 * w.px(b), f.y); w.flyStart(b, p.x, p.y, 0); S.st = 'fly'; }
    }
    if (S.st === 'fly') { if (w.flyStep(b, dt)) S.st = 'go'; return false; }
    const reach = 34 * w.px(b), dir = f.x >= b.x ? 1 : -1;
    if (S.st === 'go') {
      const p = w.clampGround(f.x - dir * reach, f.y);
      if (w.walkTo(b, p.x, p.y, dt, 1.6)) { S.st = 'peck'; S.t0 = b.at; b.face = dir; }
      return b.at > 15;
    }
    const T = 0.32, u = ((b.at - S.t0) % T) / T;
    w.reach(b, Math.sin(u * Math.PI)); b.rate = 26;
    if (u > 0.5 && !S.bit) { S.bit = 1; if (f.a <= 0 && f.left > 0) { f.left--; w.dust(b, 1); } } else if (u < 0.5) S.bit = 0;
    if (w.rand() < dt * 0.5 * b.bold) { // squabbling over the seed
      const o = w.nearest(b, x => x.act === 'forage' && x.s.st === 'peck' && x.alt < 1 && !x.swim, 40 * w.px(b));
      if (o) { if (w.rand() < 0.5) w.faceoff(b, o); else w.go(o, 'flee', { from: b }); return false; }
    }
    return b.at > 20;
  },

  arrive(w, b, dt) { // fly in from off the screen and land
    const S = b.s;
    if (!S.ok) {
      S.ok = 1; const p = S.pi != null ? null : w.spot(null), side = w.rand() < 0.5 ? -1 : 1;
      b.x = side < 0 ? -40 : w.w + 40; b.face = side < 0 ? 1 : -1;
      const toPerch = w.rand() < 0.25 ? w.freePerch(b) : -1;
      if (toPerch >= 0) { const q = w.perches[toPerch]!; q.by = b; b.y = q.gy; b.alt = q.gy - w.r(w.h * 0.02, w.h * 0.3); w.flyStart(b, q.x, q.gy, q.gy - q.y, w.r(5, 25)); S.pi = toPerch; }
      else { b.y = clamp(p!.y + w.r(-30, 30), w.top, w.bottom); b.alt = b.y - w.r(w.h * 0.03, w.h * 0.32); w.flyStart(b, p!.x, p!.y, 0, w.r(5, 30)); }
      b.fl!.take = 0;
    }
    if (w.flyStep(b, dt)) {
      if (S.pi != null) { b.perch = S.pi; w.go(b, 'perched'); return false; }
      b.then = w.rand() < 0.5 ? 'call' : 'shake'; return true;
    }
    return false;
  },

  depart(w, b, dt) { // fly off the screen for good
    const S = b.s;
    if (!S.ok) { S.ok = 1; const side = b.x < w.w / 2 ? -1 : 1; w.flyStart(b, side < 0 ? -60 : w.w + 60, b.y, b.y - w.r(0.02, 0.3) * w.h, 0, true); }
    if (w.flyStep(b, dt)) b.gone = true;
    return false;
  },

  startle(w, b, dt) { // tapped (or a neighbour was): squawk and get out of there
    const S = b.s, W = b.want;
    if (b.at < (S.delay ?? 0)) { W.crouch = 0.4; W.hAng = 0.5; return false; }
    if (!S.go) {
      S.go = 1; w.onSound(b, 'alarm'); w.feather(b);
      const pi = b.perch < 0 && w.rand() < 0.3 ? w.freePerch(b) : -1;
      if (pi >= 0) { w.go(b, 'perch', { pi }); return false; }
      const p = w.spot(null, 0, 0, S.fx ?? b.x); w.flyStart(b, p.x, p.y, 0, w.r(30, 70));
    }
    return w.flyStep(b, dt);
  },

  notice(w, b) { // their climber was tapped in the legend
    const S = b.s, W = b.want, t = b.at - (S.delay ?? 0);
    if (t < 0) return false;
    W.hAng = 0.6; W.nAng += 0.2; W.crest = 1;
    if (t < 0.2) W.tail += 0.3;
    if (t > 0.25 && t < 0.55 && b.perch < 0 && !b.swim) W.lift = Math.sin(((t - 0.25) / 0.3) * Math.PI) * b.sp.leg * 0.5;
    if (t > 0.6 && !S.c) { S.c = 1; if (w.rand() < 0.6) { w.onSound(b, 'song'); S.sing = t; } }
    if (S.sing != null) W.gape = notes(b, t - S.sing) ? 0.7 : 0;
    const end = S.sing != null ? S.sing + songLen(b.sp) + 0.3 : 1.4;
    if (t > end) { if (b.perch >= 0) { w.go(b, 'perched'); return false; } return true; }
    return false;
  },

  // reached from 'perched' only
  hang(_w, _b) { return true; },
};
