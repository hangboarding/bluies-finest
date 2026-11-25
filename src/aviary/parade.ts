// The finish-screen parade. When a session ends, the climber's birds for the week jump out from behind the tab bar
// one after another and walk along the bottom of the screen, each giving you a wink as it passes the middle. Then
// they're free: they fly up onto things on the page (the cards, the buttons, the headline, the points, the top of the
// mountain) and peck at them, walk along them, look about and fly off somewhere else, until you leave the finish
// screen and they fly away. The birds the session just earned come first, jumping higher and flapping, with a burst
// of their band colour as they land.
import { drawBird, restPose, billTip, type Pose, type PoseKey } from './rig';
import type { Look, Species } from './species';
import type { HatKind } from './hats';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0 before a, 1 after b, easing in between. */
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** A point along a curve from a through c to b. */
const bez = (a: number, c: number, b: number, t: number) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b;

/** One bird in the parade. fresh: earned by the session just finished. */
export interface Marcher { sp: Species; lk: Look; band: string; hat?: HatKind; fresh: boolean }
/** Somewhere a bird can stand: the top edge of something on the page, from x0 to x1 at height y (px, in the
 *  canvas). The tab bar is always one, 'ground'. Ids stay the same from frame to frame, so a bird standing on
 *  something moves with it as the page scrolls, and takes off when it goes. */
export interface Perch { id: string; x0: number; x1: number; y: number }
/** jump/walk/wink in a line (out), then flying, pecking, walking, looking about; wait: not out yet. */
export type Act = 'wait' | 'out' | 'fly' | 'peck' | 'walk' | 'look' | 'gone';
/** A bird as it is now: feet at (x, y), drawn at scale k facing right (1) or left (-1), on perch `on`; wink 0..1
 *  (see DrawOpts); burst: how far through a new bird's landing burst, or -1. */
export interface Frame { x: number; y: number; k: number; face: 1 | -1; act: Act; on: string | null; pose: Pose; wink: number; burst: number }

interface Flight { x0: number; y0: number; cx: number; cy: number; to: string | null; tu: number; ex: number; ey: number; T: number; t: number; take: number }
interface Mover {
  m: Marcher; i: number; act: Act; at: number; x: number; y: number; face: 1 | -1;
  /** The perch it's on, and how far along it (px from its left end). */
  on: string | null; u: number;
  fl: Flight | null;
  /** walk: where to; peck: how many and how long each (n is also look's "turned round yet"); hit: pecks landed. */
  tu: number; n: number; T: number; hit: number;
  /** Distance walked (units) and wingbeat phase. */
  d: number; ph: number;
  pose: Pose; want: Pose; wink: number; burst: number; leaveAt: number;
}
interface Fleck { x: number; y: number; vx: number; vy: number; life: number }

/** At most this many birds come out; the rest of the week's stay in the clearing. */
export const PARADE_MAX = 12;
/** They fly off on their own after this long (seconds), if you're still on the finish screen. */
export const STAY = 120;
/** Seconds in the air jumping out. */
const JUMP = { fresh: 0.85, plain: 0.62 };
/** How high the jump goes, and how far below the ground it starts (out of sight behind the bar), in units. */
const APEX = { fresh: 100, plain: 62 }, DEPTH = 120;
/** Seconds a wink takes, head cock and all. */
const WINK_S = 1.1;
/** Strides a second at most: short legs take longer strides rather than blurring. */
const CADENCE = 3.1 * TAU;
/** Pose parts set straight away each frame; the rest ease towards where they're going. */
const DIRECT: PoseKey[] = ['flap', 'fx', 'fy', 'bx', 'by', 'legs', 'eye', 'hold', 'inFoot', 'wig', 'gape'];

export class Parade {
  /** Seconds since it started. */
  t = 0;
  /** Scale (screen px per unit, before each species' size), walking speed (px/s), seconds between birds. */
  readonly k: number; readonly v: number; readonly s: number;
  private readonly big: number;
  private readonly bs: Mover[];
  private perches: Perch[] = [];
  private flecks: Fleck[] = [];
  private leaving = false;
  /** w × h: the canvas, its bottom edge the top of the tab bar. */
  constructor(readonly birds: readonly Marcher[], public w: number, public h: number, private rand: () => number = Math.random) {
    this.big = Math.max(1, ...birds.map(b => b.sp.size));
    this.k = clamp(w / 560, 0.6, 0.8);
    this.v = Math.max(115 * this.k, w / 7);
    this.s = (118 * this.k * this.big) / this.v; // the longest bird is about 100 units, bill to tail: no bumping
    this.bs = birds.map((m, i) => ({
      m, i, act: 'wait', at: 0, x: 0, y: 0, face: 1, on: null, u: 0, fl: null, tu: 0, n: 0, T: 0, hit: 0, d: 0, ph: 0,
      pose: restPose(m.sp), want: restPose(m.sp), wink: 0, burst: -1, leaveAt: Infinity,
    }));
  }
  /** The top of the tab bar. */
  get ground() { return this.h - 1; }
  /** Where they land, just in from the left edge: they jump in from behind the bar, already moving. */
  get x0() { return this.v * JUMP.fresh + 30 * this.k; }
  /** When bird i lands. They land evenly spaced, so they walk evenly spaced. */
  landing(i: number) { return JUMP.fresh + i * this.s; }
  /** Everyone's flown (or walked) off. */
  get done() { return this.bs.every(b => b.act === 'gone'); }
  /** Bird i now, or null while it's still to come out or once it's gone. */
  frame(i: number): Frame | null {
    const b = this.bs[i]; if (!b || b.act === 'wait' || b.act === 'gone') return null;
    return { x: b.x, y: b.y, k: this.k * b.m.sp.size, face: b.face, act: b.act, on: b.on, pose: b.pose, wink: b.wink, burst: b.burst };
  }
  /** Time to go: each flies away in turn, and any still to come out stay put. */
  leave() {
    if (this.leaving) return;
    this.leaving = true;
    for (const b of this.bs) { if (b.act === 'wait') b.act = 'gone'; else b.leaveAt = this.t + 0.1 + this.rand() * 0.9; }
  }

  /** Move everyone on by dt seconds. perches: what's on the page to stand on now; null once you've left the
   *  finish screen, which sends them all off. */
  step(dt: number, perches: readonly Perch[] | null = []) {
    this.t += dt;
    if (!perches || this.t > STAY) this.leave();
    this.perches = [...(perches ?? []), { id: 'ground', x0: 0, x1: this.w, y: this.ground }];
    // while the line's still coming in along the bar, the free birds keep off it
    const opening = this.bs.some(b => b.act === 'wait' || b.act === 'out');
    for (const b of this.bs) this.update(b, dt, opening);
    for (const f of this.flecks) { f.life += dt; f.vy += 420 * this.k * dt; f.x += f.vx * dt; f.y += f.vy * dt; }
    this.flecks = this.flecks.filter(f => f.life < 0.45);
  }

  private update(b: Mover, dt: number, opening: boolean) {
    if (b.act === 'gone') return;
    const sp = b.m.sp, J = b.m.fresh ? JUMP.fresh : JUMP.plain;
    if (b.act === 'wait') { if (this.t < this.landing(b.i) - J) return; b.act = 'out'; b.at = 0; }
    const W = b.want;
    Object.assign(W, restPose(sp));
    b.wink = 0; b.burst = -1; b.at += dt;
    if (this.leaving && this.t >= b.leaveAt && !(b.fl && !b.fl.to)) this.flyOff(b);
    let rate = 12;
    if (b.act === 'out') { rate = 30; this.opening(b, W); }
    else if (b.act === 'fly') { rate = 14; this.flyStep(b, dt, W, opening); }
    else { // standing on something
      const p = this.perch(b.on);
      if (!p) { this.takeOff(b, opening); this.flyStep(b, dt, W, opening); } // it's scrolled away, or gone: somewhere else
      else {
        b.u = clamp(b.u, 0, p.x1 - p.x0); b.x = p.x0 + b.u; b.y = p.y;
        let over: boolean;
        if (b.act === 'peck') { rate = 24; over = this.peck(b, W); }
        else if (b.act === 'walk') { rate = 16; over = this.walk(b, dt, W, p); }
        else { rate = 8; over = this.look(b, W); }
        if (over) this.next(b, p, opening);
      }
    }
    if ((b.act as Act) === 'gone') return; // flown or walked off just now
    const k = 1 - Math.exp(-rate * dt), P = b.pose as unknown as Record<string, number>, Wa = W as unknown as Record<string, number>;
    for (const key in Wa) P[key] = DIRECT.includes(key as PoseKey) ? Wa[key]! : P[key]! + (Wa[key]! - P[key]!) * k;
  }

  /** Jumping out, then walking along the bar in the line, winking as it passes the middle; then off to explore. */
  private opening(b: Mover, W: Pose) {
    const sp = b.m.sp, kk = this.k * sp.size, J = b.m.fresh ? JUMP.fresh : JUMP.plain, L = this.landing(b.i), t = this.t;
    b.x = this.x0 + this.v * (t - L); b.face = 1; // the same speed in the air as on the ground
    if (t < L) { // up from behind the bar, then down onto it
      const u = (t - L + J) / J, A = b.m.fresh ? APEX.fresh : APEX.plain, r = Math.sqrt((A + DEPTH) / A), top = r / (1 + r);
      b.y = this.ground - (u < top ? A - (A + DEPTH) * ((top - u) / top) ** 2 : A - A * ((u - top) / (1 - top)) ** 2) * kk;
      const arc = Math.sin(Math.PI * u);
      W.fx = 3; W.bx = -1; W.fy = W.by = 0;
      W.wing = b.m.fresh ? Math.min(1, arc * 1.8) : 0.3 * arc; W.flap = b.m.fresh ? Math.sin(t * 30) : 0.5;
      W.tail += 0.25 * arc; W.fan = 0.7 * arc; W.pitch += u < top ? 0.22 : -0.15 * ((u - top) / (1 - top));
      W.crest = (b.m.fresh ? 1 : 0.5) * arc;
      return;
    }
    b.y = this.ground;
    gait(sp, W, (this.v * (t - L)) / kk, this.v / kk);
    W.crouch = Math.max(W.crouch, 0.55 * (1 - smooth(0, 0.25, t - L))); // a little squash as it lands
    if (b.m.fresh && t < L + 0.7) b.burst = (t - L) / 0.7;
    // the wink, as it passes the middle (not quite the same spot for each, so it doesn't look drilled)
    const span = this.v * WINK_S, q = (b.x - (this.w * 0.52 + (((b.i * 7) % 5) - 2) * 9) + span / 2) / span;
    if (q > 0 && q < 1) {
      const cock = smooth(0, 0.28, q) * (1 - smooth(0.72, 1, q)); // head up and round towards you
      W.hAng += 0.34 * cock; W.nAng += 0.14 * cock; W.nExt += 0.1 * cock; W.pitch += 0.05 * cock;
      W.crest = Math.max(W.crest, cock);
      b.wink = smooth(0.2, 0.36, q) * (1 - smooth(0.64, 0.8, q));
    }
    if (q >= 1 && b.at >= 0.5) { // winked: up onto something on the page (looking again every half second if it's all taken)
      b.at = 0;
      if (this.leaving) return this.flyOff(b);
      const s = this.spot(b, false); if (s) return this.flyTo(b, s.p, s.u);
    }
    if (b.x - 80 * kk > this.w) b.act = 'gone'; // nowhere to go: it's walked off
  }

  private perch(id: string | null) { return id ? this.perches.find(p => p.id === id) ?? null : null; }
  /** Somewhere free to land (not where it is now), bigger things more likely; the bar too once the line's in. */
  private spot(b: Mover, groundOk: boolean): { p: Perch; u: number } | null {
    const ps = this.perches.filter(p => p.id !== b.on && (groundOk || p.id !== 'ground') && p.x1 >= p.x0);
    if (!ps.length) return null;
    const wt = ps.map(p => 60 + Math.min(240, p.x1 - p.x0)), sum = wt.reduce((a, x) => a + x, 0);
    for (let n = 0; n < 12; n++) {
      let r = this.rand() * sum, j = 0;
      while (j < ps.length - 1 && r >= wt[j]!) r -= wt[j++]!;
      const p = ps[j]!, u = (p.x1 - p.x0) * (0.1 + 0.8 * this.rand());
      if (this.room(b, p, u)) return { p, u };
    }
    return null;
  }
  /** Whether there's room at u along p: nobody standing there, walking there or landing there, on p or on anything
   *  else close by (the points sit inside their box, say). */
  private room(b: Mover, p: Perch, u: number) {
    const gap = 70 * this.k * this.big, tall = 45 * this.k * this.big, x = p.x0 + u, y = p.y;
    const near = (ox: number, oy: number) => Math.abs(ox - x) < gap && Math.abs(oy - y) < tall;
    return this.bs.every(o => {
      if (o === b || o.act === 'gone' || o.act === 'wait' || o.act === 'out') return true; // the line on the bar keeps to itself
      if (o.fl) return !o.fl.to || !near(o.fl.ex, o.fl.ey);
      const op = o.act === 'walk' ? this.perch(o.on) : null;
      return !near(o.x, o.y) && !(op && near(op.x0 + o.tu, op.y));
    });
  }

  private flyTo(b: Mover, p: Perch, u: number) {
    const ex = p.x0 + u, ey = p.y, len = Math.hypot(ex - b.x, ey - b.y);
    const cx = (b.x + ex) / 2 + (this.rand() - 0.5) * this.w * 0.35; // a swoop out to one side or the other…
    const cy = Math.max(30, Math.min(b.y, ey) - (30 + len * 0.3) * (0.5 + this.rand())); // …and up over the top
    this.launch(b, { x0: b.x, y0: b.y, cx, cy, to: p.id, tu: u, ex, ey, T: clamp(len / (330 * this.k), 0.8, 2.4), t: 0, take: 0 });
  }
  /** Away up and off the nearer side. */
  private flyOff(b: Mover) {
    const ex = b.x > this.w / 2 ? this.w + 110 : -110, ey = -70 + this.rand() * this.h * 0.4, len = Math.hypot(ex - b.x, ey - b.y);
    this.launch(b, { x0: b.x, y0: b.y, cx: (b.x + ex) / 2, cy: Math.min(b.y, ey) - 40 - this.rand() * 80, to: null, tu: 0, ex, ey, T: clamp(len / (380 * this.k), 0.9, 2.6), t: 0, take: 0 });
  }
  private launch(b: Mover, f: Flight) {
    const airborne = b.act === 'fly' || (b.act === 'out' && this.t < this.landing(b.i));
    f.take = airborne ? 0 : 0.12; // a crouch before it springs up, unless it's in the air already
    b.fl = f; b.act = 'fly'; b.on = null; b.at = 0;
  }
  private takeOff(b: Mover, opening: boolean) {
    const s = this.leaving ? null : this.spot(b, !opening);
    if (s) this.flyTo(b, s.p, s.u); else this.flyOff(b);
  }

  private flyStep(b: Mover, dt: number, W: Pose, opening: boolean) {
    const f = b.fl; if (!f) return;
    f.t += dt;
    if (f.to) { // where it's landing may have moved (the page scrolled) or gone
      const p = this.perch(f.to);
      if (!p) { b.fl = null; this.takeOff(b, opening); return this.flyStep(b, 0, W, opening); }
      f.tu = clamp(f.tu, 0, p.x1 - p.x0); f.ex = p.x0 + f.tu; f.ey = p.y;
    }
    if (f.t < f.take) { W.crouch = 0.75; W.wing = 0.4; W.flap = 0.7; W.tail += 0.2; W.pitch += 0.12; return; }
    const s = Math.min(1, (f.t - f.take) / f.T), e = s * s * (3 - 2 * s), px = b.x;
    b.x = bez(f.x0, f.cx, f.ex, e); b.y = bez(f.y0, f.cy, f.ey, e);
    if (Math.abs(b.x - px) > 0.05) b.face = b.x > px ? 1 : -1;
    b.ph += dt * b.m.sp.flapHz * TAU;
    W.legs = s < 0.08 ? 1 : 0; W.wing = 1; W.crouch = 0; W.crest = 0; W.flap = Math.sin(b.ph);
    W.pitch = 0.05 + (s < 0.3 ? 0.18 : 0); W.nAng = 0.4; W.nExt = 0.9; W.hAng = -0.05; W.tail = 0; W.fan = 0.3; W.fx = -3; W.bx = -5; W.fy = W.by = 4;
    if (f.to && s > 0.8) { // flare and reach for the landing
      W.legs = 1; W.pitch = 0.6; W.flap = Math.sin(b.ph * 1.3) * 0.75 + 0.25; W.fan = 1; W.fx = 7; W.bx = 4; W.fy = W.by = 3; W.tail = 0.3;
    }
    if (s < 1) return;
    b.fl = null;
    if (!f.to) { b.act = 'gone'; return; }
    b.on = f.to; b.u = f.tu; b.x = f.ex; b.y = f.ey;
    this.startPeck(b); // landed: whatever it's on, it has a peck at it
    W.crouch = 0.5;
  }

  /** What next, standing on p: a peck, a walk along it, a look about, or off somewhere else. */
  private next(b: Mover, p: Perch, opening: boolean) {
    b.at = 0;
    const r = this.rand(), width = p.x1 - p.x0;
    if (r < 0.28) return this.startPeck(b);
    if (r < 0.48 && width > 40 * this.k) {
      const tu = width * (0.1 + 0.8 * this.rand());
      if (Math.abs(tu - b.u) > 15 && this.room(b, p, tu)) { b.tu = tu; b.act = 'walk'; return; }
    }
    if (r < 0.6) { b.act = 'look'; b.T = 0.8 + this.rand() * 1.4; b.n = 0; return; }
    const s = this.spot(b, !opening);
    if (s) this.flyTo(b, s.p, s.u); else this.startPeck(b);
  }
  private startPeck(b: Mover) { b.act = 'peck'; b.at = 0; b.n = 2 + Math.floor(this.rand() * 4); b.T = 0.28 + this.rand() * 0.12; b.hit = 0; }
  /** A few pecks, chips flying off each one. True when it's done. */
  private peck(b: Mover, W: Pose) {
    const i = Math.floor(b.at / b.T), u = (b.at % b.T) / b.T;
    if (i >= b.n) return true;
    reach(b.m.sp, W, u < 0.45 ? u / 0.45 : u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4);
    if (u > 0.45 && b.hit <= i) {
      b.hit = i + 1;
      const kk = this.k * b.m.sp.size, [tx, ty] = billTip(b.m.sp, W);
      for (let j = 0; j < 3; j++) this.flecks.push({ x: b.x + tx * kk * b.face, y: b.y + ty * kk, vx: (this.rand() - 0.5) * 110 * this.k, vy: -(50 + this.rand() * 80) * this.k, life: 0 });
    }
    return false;
  }
  private walk(b: Mover, dt: number, W: Pose, p: Perch) {
    const kk = this.k * b.m.sp.size, vw = this.v * 0.5, step = vw * dt, dir = b.tu > b.u ? 1 : -1;
    b.face = dir;
    if (Math.abs(b.tu - b.u) <= step) { b.u = b.tu; b.x = p.x0 + b.u; return true; }
    b.u += dir * step; b.x = p.x0 + b.u; b.d += step / kk;
    gait(b.m.sp, W, b.d, vw / kk);
    return b.at > 6;
  }
  /** Head this way and that, turning round halfway. */
  private look(b: Mover, W: Pose) {
    W.hAng += 0.35 * Math.sin(b.at * 2.6 + b.i); W.nAng += 0.1 * Math.sin(b.at * 1.7);
    if (!b.n && b.at > b.T / 2) { b.n = 1; b.face = b.face === 1 ? -1 : 1; }
    return b.at > b.T;
  }

  /** Draw everyone: standing birds, then flying ones over the top. halo: a #rrggbb colour (the page's text
   *  colour) glowing faintly behind each bird, so a black bird shows on a dark page and a white one on a light one. */
  draw(c: Ctx, halo?: string) {
    const rgb = halo && /^#[0-9a-f]{6}$/i.test(halo) ? [1, 3, 5].map(j => parseInt(halo.slice(j, j + 2), 16)).join(',') : null;
    const out = this.bs.filter(b => b.act !== 'wait' && b.act !== 'gone').sort((a, b) => +(a.act === 'fly') - +(b.act === 'fly'));
    for (const b of out) {
      const kk = this.k * b.m.sp.size;
      if (rgb && b.y < this.ground + 20 * kk) {
        const y = b.y - 28 * kk, R = 62 * kk, g = c.createRadialGradient(b.x, y, 0, b.x, y, R);
        g.addColorStop(0, `rgba(${rgb},0.13)`); g.addColorStop(0.45, `rgba(${rgb},0.06)`); g.addColorStop(1, `rgba(${rgb},0)`);
        c.save(); c.translate(b.x, y); c.scale(1, 0.72); c.translate(-b.x, -y);
        c.fillStyle = g; c.beginPath(); c.arc(b.x, y, R, 0, TAU); c.fill(); c.restore();
      }
      const under = b.act === 'out' ? this.ground : b.on ? b.y : null; // a shadow on whatever it's standing on (fading as it jumps)
      if (under != null && b.y > under - 90 * kk && b.y < under + 20 * kk) {
        const near = clamp(1 - (under - b.y) / (90 * kk), 0, 1);
        c.beginPath(); c.ellipse(b.x + 2 * kk * b.face, under, b.m.sp.rx * kk * (0.5 + 0.5 * near), 2.4, 0, 0, TAU);
        c.fillStyle = `rgba(0,0,0,${(0.22 * near).toFixed(3)})`; c.fill();
      }
      c.save(); c.translate(b.x, b.y); c.scale(kk * b.face, kk);
      drawBird(c, b.m.sp, b.m.lk, b.pose, { band: b.m.band, ...(b.m.hat ? { hat: b.m.hat } : {}), t: this.t + b.i, wink: b.wink });
      c.restore();
      if (b.burst >= 0) burst(c, this.x0, this.ground - 30 * kk, b.burst, b.m.band, kk);
    }
    if (this.flecks.length) {
      c.fillStyle = rgb ? `rgba(${rgb},0.75)` : '#c9c2b4';
      for (const f of this.flecks) { c.globalAlpha = 1 - f.life / 0.45; c.fillRect(f.x - 1, f.y - 1, 2, 2); }
      c.globalAlpha = 1;
    }
  }
}

/** Walking (or hopping, for hoppers), `d` units along at `vu` units a second, into pose p. */
function gait(sp: Species, p: Pose, d: number, vu: number) {
  if (sp.gait === 'hop') {
    const len = vu * 0.34, u = (d / len) % 1, up = Math.sin(Math.PI * clamp((u - 0.14) / 0.72, 0, 1));
    p.lift = up * Math.min(sp.leg * 1.3, len * 0.34); p.crouch = 0.15 + 0.3 * (1 - up);
    p.fx = 2 + up; p.bx = -2 + up; p.fy = p.by = up * 1.2; p.tail += 0.15 * up; p.pitch -= 0.06 * up;
    return;
  }
  const waddle = sp.gait === 'waddle', stride = Math.max(sp.leg * (waddle ? 0.22 : 0.3) * 1.6, (Math.PI * vu) / (2 * CADENCE));
  const ph = (Math.PI * d) / (2 * stride), s = Math.sin(ph), c = Math.cos(ph);
  p.fx = 2 + s * stride; p.fy = Math.max(0, c) * sp.leg * 0.24; p.bx = -2 - s * stride; p.by = Math.max(0, -c) * sp.leg * 0.24;
  if (waddle) { p.pitch += 0.07 * s; p.lift = 0.8 * Math.abs(s); p.tail += 0.06 * s; }
  else { p.nExt = 1 + 0.16 * Math.sin(ph * 2); p.lift = 0.9 * Math.abs(c); p.pitch -= 0.05; }
}

/** Lean the bill down to what it's standing on (k: 0 upright, 1 bill touching), as the birds in the clearing do. */
function reach(sp: Species, W: Pose, k: number) {
  const parrot = sp.bill.type === 'hook', duck = sp.id === 'woodduck';
  W.pitch = lerp(W.pitch, parrot ? 0.05 : duck ? -0.25 : -0.32, k);
  W.nAng = lerp(W.nAng, -1.15, k); W.nExt = lerp(W.nExt, duck ? 1.45 : 1.3, k);
  W.hAng = lerp(W.hAng, -1.25, k); W.crouch = lerp(W.crouch, parrot ? 0.55 : 0.25, k); W.tail = lerp(W.tail, 0.25, k);
  const [, ty] = billTip(sp, W); // sink a little further if the bill still doesn't reach
  if (ty < 0) W.lift = Math.max(W.lift + ty * k * 0.9, -sp.leg * 0.45);
}

/** A new bird's landing: dots of its band colour and gold sparks, flung up and out. f: 0..1 through it. */
function burst(c: Ctx, x: number, y: number, f: number, band: string, k: number) {
  const e = 1 - (1 - f) ** 3;
  c.save(); c.globalAlpha = 1 - f;
  for (let j = 0; j < 9; j++) {
    const a = Math.PI * (1.08 + (0.84 * j) / 8), d = (16 + 46 * e) * k * (j % 2 ? 0.8 : 1);
    const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d + 18 * k * f * f, r = (j % 2 ? 3.2 : 2.6) * k * (1 - 0.4 * f);
    c.beginPath();
    if (j % 2) { c.moveTo(px, py - r * 1.6); c.lineTo(px + r * 0.5, py); c.lineTo(px, py + r * 1.6); c.lineTo(px - r * 0.5, py); c.closePath(); c.fillStyle = '#ffd95e'; }
    else { c.arc(px, py, r, 0, TAU); c.fillStyle = band; }
    c.fill();
  }
  c.restore();
}
