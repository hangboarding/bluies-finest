// Shapes that should look grown rather than drawn: eucalypts that branch and taper, tree hollows with a rolled
// collar of bark round a ragged opening, and blocky sandstone boulders. Everything is seeded, so a scene comes out
// the same every time it's painted.
type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const hex = (h: string) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
export const tint = (a: string, b: string | undefined, t: number) => { if (!b || !t) return a; const x = hex(a), y = hex(b); return '#' + x.map((v, i) => Math.round(v + (y[i]! - v) * t).toString(16).padStart(2, '0')).join(''); };
export function rng(seed: number) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Bark colours [light side, shaded side]: smooth pale gums, grey ironbark-ish, brown stringybark. */
export const BARKS: [string, string][] = [['#e7e1d4', '#b9b09c'], ['#d6cfbf', '#a29a88'], ['#8d7d6b', '#62564a'], ['#6f655c', '#4c443e']];
export const LEAVES = ['#5d6d41', '#73834f', '#4b5a35', '#66774a', '#7d8c5c'];

/** A curved, tapering limb from (x0, y0) to (x1, y1), bowed by `bow`, shaded on one side. */
export function taper(c: Ctx, x0: number, y0: number, x1: number, y1: number, w0: number, w1: number, bow: number, col: [string, string]) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  const mx = (x0 + x1) / 2 + nx * bow, my = (y0 + y1) / 2 + ny * bow, n = 7, left: [number, number][] = [], right: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * mx + t * t * x1, y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * my + t * t * y1;
    const tx = 2 * (1 - t) * (mx - x0) + 2 * t * (x1 - mx), ty = 2 * (1 - t) * (my - y0) + 2 * t * (y1 - my), tl = Math.hypot(tx, ty) || 1;
    const hw = (w0 + (w1 - w0) * t) / 2;
    left.push([x - (ty / tl) * hw, y + (tx / tl) * hw]); right.push([x + (ty / tl) * hw, y - (tx / tl) * hw]);
  }
  c.fillStyle = col[0]; c.beginPath(); left.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); for (let i = n; i >= 0; i--) c.lineTo(right[i]![0], right[i]![1]); c.closePath(); c.fill();
  // the shaded side: a strip along one edge
  c.fillStyle = col[1]; c.beginPath();
  left.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  for (let i = n; i >= 0; i--) { const [lx, ly] = left[i]!, [rx, ry] = right[i]!; c.lineTo(lx + (rx - lx) * 0.35, ly + (ry - ly) * 0.35); }
  c.closePath(); c.fill();
  c.fillStyle = col[0]; c.beginPath(); c.arc(x0, y0, w0 / 2, 0, TAU); c.fill(); // round off the joint
}

/** Open clumps of eucalypt leaves. */
export function foliage(c: Ctx, r: () => number, x: number, y: number, rad: number, cols: string[], n = 40) {
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * rad;
    c.save(); c.translate(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.65); c.rotate(1.1 + r() * 0.9);
    c.fillStyle = cols[Math.floor(r() * cols.length)]!; c.beginPath(); c.ellipse(0, 0, 1.4 + r() * 2.4, rad * 0.1 + 1.6, 0, 0, TAU); c.fill(); c.restore();
  }
}

export interface TreeOpts {
  x: number; base: number; h: number; w: number;
  bark?: [string, string]; leaves?: string[]; haze?: string; hazeK?: number;
  /** Lean of the trunk (rad, + to the right), how wide the crown spreads (1 normal), how many times it forks. */
  lean?: number; spread?: number; levels?: number;
  /** How big the clumps of leaves are, relative to the tree (1 normal); 0 for a dead tree. */
  leafy?: number;
  /** A climber growing on it: which kind (see drawVine) and its own seed. */
  vine?: { kind: number; seed: number };
}

/** Something a vine can climb: its centre and half-width at t (0 at the foot, 1 at the end). */
export type Stalk = (t: number) => readonly [number, number, number];
/** The limb `taper` draws, as a Stalk. */
export function quadStalk(x0: number, y0: number, x1: number, y1: number, w0: number, w1: number, bow: number): Stalk {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, mx = (x0 + x1) / 2 - (dy / L) * bow, my = (y0 + y1) / 2 + (dx / L) * bow;
  return t => [(1 - t) ** 2 * x0 + 2 * (1 - t) * t * mx + t * t * x1, (1 - t) ** 2 * y0 + 2 * (1 - t) * t * my + t * t * y1, (w0 + (w1 - w0) * t) / 2] as const;
}

/** A native climber twining up a trunk to `up` of the way: wonga vine (kind 0), clematis (1) or hardenbergia (2). Its
 *  stem shows where it crosses the front of the trunk and is hidden where it goes round the back, its leaves poke out
 *  past the trunk's edges, then it runs out along a limb or two and hangs from them in loose strands, here and there in
 *  flower. With no limbs to climb onto, strands fall from the top of its climb. `k` sizes its leaves. */
export function drawVine(c: Ctx, r: () => number, trunk: Stalk, limbs: Stalk[], k: number, kind: number, up: number) {
  const LEAF = ['#3d6a2a', '#4f7d34', '#5f8c3c', '#46732f'];
  const leaf = (x: number, y: number, a: number, sz: number) => {
    c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = LEAF[Math.floor(r() * LEAF.length)]!;
    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(sz * 0.55, -sz * 0.42, sz * 1.3, 0); c.quadraticCurveTo(sz * 0.55, sz * 0.42, 0, 0); c.fill(); c.restore();
  };
  const flower = (x: number, y: number) => {
    if (kind === 0) for (let i = 0; i < 4; i++) { // wonga vine: a cluster of creamy bells with maroon throats
      const fx = x + (r() - 0.5) * 4 * k, fy = y + (r() - 0.3) * 3 * k;
      c.fillStyle = '#f2e9d2'; c.beginPath(); c.ellipse(fx, fy, 1.1 * k, 1.5 * k, r() - 0.5, 0, TAU); c.fill();
      c.fillStyle = '#8b3a3f'; c.beginPath(); c.arc(fx, fy + 0.3 * k, 0.45 * k, 0, TAU); c.fill();
    } else if (kind === 1) for (let i = 0; i < 2; i++) { // clematis: white stars
      const fx = x + (r() - 0.5) * 4 * k, fy = y + (r() - 0.5) * 3 * k;
      c.fillStyle = '#f8f6ee';
      for (let p = 0; p < 4; p++) { const a = (p / 4) * TAU + 0.4; c.beginPath(); c.ellipse(fx + Math.cos(a) * 1.1 * k, fy + Math.sin(a) * 1.1 * k, 1.1 * k, 0.45 * k, a, 0, TAU); c.fill(); }
      c.fillStyle = '#e3d68a'; c.beginPath(); c.arc(fx, fy, 0.45 * k, 0, TAU); c.fill();
    } else for (let i = 0; i < 6; i++) { // hardenbergia: sprays of little purple peas
      c.fillStyle = r() < 0.5 ? '#6a4aa2' : '#8b6cc6'; c.beginPath(); c.arc(x + (r() - 0.5) * 3 * k, y + (i - 2) * 0.9 * k, 0.75 * k, 0, TAU); c.fill();
    }
  };
  // a stem from (x0, y0) to (x1, y1), curving through (cx, cy), with leaves along it hanging off to the sides
  const strand = (x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, lw: number, sz: number) => {
    c.strokeStyle = '#55613a'; c.lineWidth = lw; c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(cx, cy, x1, y1); c.stroke();
    const n = Math.max(3, Math.round(Math.hypot(x1 - x0, y1 - y0) / (3 * k)));
    for (let m = 1; m <= n; m++) {
      const t = m / n, x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1, y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1;
      leaf(x, y, (r() < 0.5 ? 0.5 : Math.PI - 0.5) + (r() - 0.5) * 0.9, sz * (0.75 + r() * 0.5) * (1 - t * 0.3));
      if (r() < 0.06) flower(x, y + k);
    }
    if (r() < 0.4) flower(x1, y1 + k);
  };
  const hang = (x: number, y: number, len: number) => { const sw = (r() - 0.5) * len * 0.4; strand(x, y, x + sw, y + len * 0.6, x + sw * 0.5, y + len, Math.max(0.5, 0.7 * k), 1.7 * k); };
  c.lineCap = 'round';
  // up the trunk
  const turns = 2.2 + r() * 1.6, ph = r() * TAU, n = 120;
  let prev: [number, number] | null = null;
  for (let i = 0; i <= n; i++) {
    const t = 0.02 + (i / n) * (up - 0.02), [cx, y, hw] = trunk(t), f = ph + t * turns * TAU, s = Math.sin(f), front = Math.cos(f) > -0.2;
    const x = cx + s * hw * 0.97;
    c.strokeStyle = '#55613a'; c.lineWidth = Math.max(0.7, 1.2 * k * (1 - t * 0.4));
    if (front && prev) { c.beginPath(); c.moveTo(prev[0], prev[1]); c.lineTo(x, y); c.stroke(); }
    prev = front ? [x, y] : null;
    if (i % 3 === 0 && (front || Math.abs(s) > 0.8)) {
      const side = s >= 0 ? 1 : -1, a = side > 0 ? -0.6 + (r() - 0.5) * 1.4 : Math.PI + 0.6 + (r() - 0.5) * 1.4;
      leaf(x, y, a, (2 + r() * 1.6) * k);
      if (r() < 0.45) leaf(x, y, a + (r() - 0.5) * 2.4, (1.6 + r() * 1.4) * k);
      if (r() < 0.08) flower(x + side * 2 * k, y);
    }
  }
  // out along the limbs, hanging down from them, and draped from the trunk across to the first
  for (const limb of limbs) {
    const reach = 0.35 + r() * 0.5, m = 40; prev = null;
    for (let i = 0; i <= m; i++) {
      const t = (i / m) * reach, [cx, cy, hw] = limb(t), x = cx + Math.sin(t * 25 + ph) * hw * 0.5, y = cy - hw * 0.4;
      c.strokeStyle = '#55613a'; c.lineWidth = Math.max(0.6, 0.9 * k);
      if (prev) { c.beginPath(); c.moveTo(prev[0], prev[1]); c.lineTo(x, y); c.stroke(); }
      prev = [x, y];
      if (i % 3 === 0) { leaf(x, y, -Math.PI / 2 + (r() - 0.5) * 2.4, (1.8 + r() * 1.4) * k); if (r() < 0.1) flower(x, y - 1.5 * k); }
    }
    for (let j = 0; j < 1 + Math.floor(r() * 3); j++) { const [hx, hy] = limb(r() * reach); hang(hx, hy, (10 + r() * 22) * k * 1.6); }
  }
  if (limbs.length) {
    const [ax, ay] = trunk(up * (0.6 + r() * 0.3)), [bx, by] = limbs[0]!(0.25 + r() * 0.3), sag = Math.abs(bx - ax) * 0.5 + 8 * k;
    strand(ax, ay, (ax + bx) / 2, Math.max(ay, by) + sag, bx, by, Math.max(0.5, 0.8 * k), 1.8 * k);
  } else {
    for (let j = 0; j < 2 + Math.floor(r() * 2); j++) { const [cx, y, hw] = trunk(up * (0.75 + r() * 0.25)); hang(cx + (r() < 0.5 ? -1 : 1) * hw * 0.9, y, (14 + r() * 26) * k * 1.6); }
  }
}
/** A eucalypt, grown: a trunk that bends a little and forks, limbs that fork again and taper, angled upward the way
 *  gums grow, with open clumps of leaves at the ends. Different every seed. Returns the box it was drawn in. */
export function growTree(c: Ctx, r: () => number, o: TreeOpts) {
  const bark = (o.bark ?? BARKS[0]!).map(s => tint(s, o.haze, o.hazeK ?? 0)) as [string, string];
  const leaves = (o.leaves ?? LEAVES).map(s => tint(s, o.haze, o.hazeK ?? 0));
  const levels = o.levels ?? 4, spread = o.spread ?? 1, tips: [number, number, number][] = [], stalks: [number, Stalk][] = [];
  const box = { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity };
  const fit = (x: number, y: number, m: number) => { box.l = Math.min(box.l, x - m); box.r = Math.max(box.r, x + m); box.t = Math.min(box.t, y - m); box.b = Math.max(box.b, y + m); };
  const seg = (x: number, y: number, a: number, len: number, w0: number, lv: number) => {
    const w1 = w0 * (lv === 0 ? 0.62 : 0.6), ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len, bow = (r() - 0.5) * len * 0.22;
    taper(c, x, y, ex, ey, w0, w1, bow, bark); fit(x, y, w0 + 1); fit(ex, ey, w0 + Math.abs(bow) + 1);
    if (o.vine && lv < 2) stalks.push([lv, quadStalk(x, y, ex, ey, w0, w1, bow)]); // the trunk and first limbs, for the vine
    if (lv >= levels || w1 < 0.7) { tips.push([ex, ey, len]); return; }
    const n = lv === 0 ? 2 + (r() < 0.6 ? 1 : 0) : r() < 0.7 ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const lead = i === Math.floor(n / 2) && lv < 2; // one limb carries on as the leader
      let ca = a + spread * (i - (n - 1) / 2) * (0.45 + r() * 0.35) + (r() - 0.5) * 0.3;
      ca = clamp(ca, -Math.PI + 0.3, -0.25);
      seg(ex, ey, ca, len * (lead ? 0.78 : 0.55 + r() * 0.2), w1 * (lead ? 0.95 : 0.62 + r() * 0.15), lv + 1);
    }
    if (lv >= 1 && r() < 0.35) tips.push([ex + (r() - 0.5) * len * 0.3, ey, len * 0.6]); // a few leaves along the way too
  };
  seg(o.x, o.base, -Math.PI / 2 + (o.lean ?? 0) + (r() - 0.5) * 0.08, o.h * (0.4 + r() * 0.1), o.w, 0);
  if (o.vine) { // climbing the trunk and out along a limb or two, under the leaves
    const vr = rng(o.vine.seed), limbs = stalks.filter(s => s[0] === 1).map(s => s[1]);
    drawVine(c, vr, stalks[0]![1], limbs.slice(0, 1 + (vr() < 0.6 ? 1 : 0)), clamp(o.w / 7, 0.6, 1.3), o.vine.kind, 0.97);
  }
  if (o.leafy === 0) return box;
  // open, drooping clumps rather than balls: a few small ones scattered round each tip
  for (const [x, y, len] of tips) {
    const rad = Math.max(3, len * 0.34 * (o.leafy ?? 1));
    for (let k = 0; k < 2; k++) foliage(c, r, x + (r() - 0.5) * rad * 1.2, y - 1 + (r() - 0.3) * rad * 0.8, rad * (0.7 + r() * 0.4), leaves, 10 + Math.round(len * 0.25));
    fit(x, y, rad * 2 + 6);
  }
  return box;
}

/** The outline of a tree hollow's opening: taller than wide, narrowing to a point at the top, the edge uneven. */
export function hollowPath(cx: number, cy: number, rx: number, ry: number, seed: number) {
  const r = rng(seed), n = 14, pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU - Math.PI / 2, up = Math.max(0, -Math.sin(a)), j = 1 + (r() - 0.5) * 0.28;
    pts.push([cx + Math.cos(a) * rx * j * (1 - 0.5 * up * up), cy + Math.sin(a) * ry * j * (1 + 0.25 * up)]);
  }
  const p = new Path2D();
  const mid = (i: number): [number, number] => { const a = pts[i % n]!, b = pts[(i + 1) % n]!; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
  const m0 = mid(n - 1); p.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) { const [x, y] = pts[i]!, [mx, my] = mid(i); p.quadraticCurveTo(x, y, mx, my); }
  p.closePath();
  return p;
}
/** A hollow as it forms where a limb has broken off: a swollen collar of bark rolled round a dark, ragged opening. */
export function drawHollow(c: Ctx, cx: number, cy: number, rx: number, ry: number, seed: number, bark: [string, string]) {
  const r = rng(seed + 1);
  c.fillStyle = bark[1]; c.fill(hollowPath(cx + 0.5, cy + 0.5, rx * 1.55, ry * 1.4, seed + 2)); // the collar's shadow side
  c.fillStyle = bark[0]; c.fill(hollowPath(cx - 0.6, cy - 0.4, rx * 1.45, ry * 1.32, seed + 2));
  c.strokeStyle = 'rgba(90,80,64,0.45)'; c.lineWidth = 0.7; // rings of callus round it
  c.stroke(hollowPath(cx, cy, rx * 1.22, ry * 1.15, seed + 3));
  const g = c.createLinearGradient(cx, cy - ry, cx, cy + ry);
  g.addColorStop(0, '#060504'); g.addColorStop(0.7, '#1b150f'); g.addColorStop(1, '#3a2e22');
  c.fillStyle = g; c.fill(hollowPath(cx, cy, rx, ry, seed));
  c.strokeStyle = 'rgba(255,250,235,0.16)'; c.lineWidth = 0.8; // the lower lip, just catching the light
  c.beginPath(); c.ellipse(cx, cy + ry * 0.1, rx * 0.8, ry * 0.85, 0, 0.7, Math.PI - 0.7); c.stroke();
  c.strokeStyle = 'rgba(80,70,55,0.5)'; c.lineWidth = 0.7; // a few cracks running off it
  for (let i = 0; i < 4; i++) { const a = r() < 0.5 ? -Math.PI / 2 + (r() - 0.5) * 0.6 : Math.PI / 2 + (r() - 0.5) * 0.6; c.beginPath(); c.moveTo(cx + Math.cos(a) * rx * 1.3, cy + Math.sin(a) * ry * 1.25); c.lineTo(cx + Math.cos(a) * rx * 1.3 + (r() - 0.5) * 3, cy + Math.sin(a) * (ry * 1.25 + 5 + r() * 9)); c.stroke(); }
}

/** A wombat burrow's mouth, dug into a bank facing the clearing: flat along the bottom, arched and a little lopsided
 *  over the top, wider than it is tall. (x, y) is where the wombat stands in the entrance; k is pixels per unit. */
export function burrowMouth(x: number, y: number, k: number) {
  const p = new Path2D(), l = x - 19 * k, r = x + 9 * k, top = y - 23 * k, b = y + 1.5 * k, m = (l + r) / 2;
  p.moveTo(l, b);
  p.bezierCurveTo(l - 1.5 * k, y - 12 * k, l + 3 * k, top + 1 * k, m - 2 * k, top);
  p.bezierCurveTo(m + 3 * k, top - 0.8 * k, r - 1 * k, top + 6 * k, r + 0.5 * k, y - 9 * k);
  p.quadraticCurveTo(r + 1.2 * k, y - 3 * k, r, b);
  p.quadraticCurveTo(m, b + 1.5 * k, l, b);
  p.closePath();
  return p;
}

/** Native shrubs, each its own kind by seed: tea-tree white, correa's red bells, yellow peas, purple hardenbergia, or
 *  just leaves. A rounded, uneven dome of small leaves on a few stems, `s` being its half-width. */
const SHRUBS: { leaf: string[]; flower: string | null; bell?: boolean }[] = [
  { leaf: ['#45613a', '#5a7a45', '#3b5233'], flower: '#f4f1e7' },
  { leaf: ['#4d6b3c', '#62803f', '#41593a'], flower: '#d8344a', bell: true },
  { leaf: ['#57704a', '#6f8a55', '#4a6140'], flower: '#f2c632' },
  { leaf: ['#3f5a3a', '#56714a', '#344a30'], flower: '#9a6fd6' },
  { leaf: ['#647a4a', '#7d9258', '#55693f'], flower: null },
];
export function drawShrub(c: Ctx, s: number, seed: number) {
  const r = rng(seed * 31 + 7), kind = SHRUBS[seed % SHRUBS.length]!, lobes = [r(), r(), r(), r()];
  const edge = (a: number) => s * (0.8 + 0.2 * Math.sin(a * 3 + lobes[0]! * 6) + 0.12 * Math.sin(a * 7 + lobes[1]! * 6)); // uneven outline
  c.strokeStyle = '#4b3c2e'; c.lineWidth = Math.max(1, s * 0.08); c.lineCap = 'round';
  for (const d of [-0.45, 0, 0.4]) { c.beginPath(); c.moveTo(d * s * 0.2, 0); c.quadraticCurveTo(d * s * 0.4, -s * 0.3, d * s * 0.8, -s * 0.7); c.stroke(); }
  const n = Math.round(s * 15);
  for (let i = 0; i < n; i++) { // leaves fill an uneven dome; darker underneath, lighter on top
    const a = Math.PI + r() * Math.PI, d = Math.pow(r(), 0.35), e = edge(a), x = Math.cos(a) * e * 1.1 * d, y = -s * 0.12 + Math.sin(a) * e * 1.25 * d;
    const shade = y < -s * 0.6 ? 1 : y < -s * 0.3 ? 0 : 2;
    c.save(); c.translate(x, y); c.rotate(r() * Math.PI); c.fillStyle = kind.leaf[shade]!; c.beginPath(); c.ellipse(0, 0, 1.6 + r() * 1.6 + s * 0.04, 0.9 + r() * 0.6, 0, 0, TAU); c.fill(); c.restore();
  }
  if (!kind.flower) return;
  for (let i = 0; i < Math.round(s * 1.6); i++) {
    const a = Math.PI * 1.05 + r() * Math.PI * 0.9, d = 0.55 + r() * 0.45, e = edge(a), x = Math.cos(a) * e * 1.05 * d, y = -s * 0.12 + Math.sin(a) * e * 1.2 * d;
    c.fillStyle = kind.flower;
    if (kind.bell) { c.beginPath(); c.moveTo(x - 0.7, y); c.lineTo(x + 0.7, y); c.lineTo(x + 0.4, y + 2.2); c.lineTo(x - 0.4, y + 2.2); c.closePath(); c.fill(); }
    else { c.beginPath(); c.arc(x, y, 0.8 + r() * 0.5, 0, TAU); c.fill(); }
  }
}

/** A sandstone boulder sitting at (x, y): blocky, flat-ish on top, with layers in it. `s` is its half-width. */
export function drawRock(c: Ctx, x: number, y: number, s: number, seed: number) {
  const r = rng(seed), tall = 0.45 + r() * 0.45, grey = r() < 0.3, skew = (r() - 0.5) * 0.4;
  const base = grey ? '#8f8a7c' : '#a3875f', top = grey ? '#b3ad9e' : '#c8ad80', dark = grey ? '#6e6a5f' : '#7d6446';
  const h = s * tall, pts: [number, number][] = [
    [-s, 0], [-s * (0.9 + r() * 0.1), -h * (0.45 + r() * 0.2)], [-s * (0.55 + r() * 0.15) + skew * s, -h * (0.9 + r() * 0.1)],
    [s * (0.1 + r() * 0.2) + skew * s, -h], [s * (0.6 + r() * 0.2), -h * (0.75 + r() * 0.2)], [s * (0.95 + r() * 0.08), -h * (0.3 + r() * 0.2)], [s * 0.92, 0],
  ];
  c.fillStyle = 'rgba(35,40,20,0.28)'; c.beginPath(); c.ellipse(x + s * 0.15, y + 0.5, s * 1.2, s * 0.32, 0, 0, TAU); c.fill();
  const body = new Path2D(); pts.forEach(([px, py], i) => (i ? body.lineTo(x + px, y + py) : body.moveTo(x + px, y + py))); body.closePath();
  c.fillStyle = base; c.fill(body);
  c.save(); c.clip(body);
  c.fillStyle = top; c.beginPath(); c.moveTo(x + pts[1]![0], y + pts[1]![1]); for (let i = 2; i <= 5; i++) c.lineTo(x + pts[i]![0], y + pts[i]![1]);
  c.lineTo(x + pts[5]![0] - s * 0.15, y + pts[5]![1] + h * 0.22); c.lineTo(x + pts[1]![0] + s * 0.2, y + pts[1]![1] + h * 0.25); c.closePath(); c.fill(); // the sunlit top
  c.fillStyle = dark; c.globalAlpha = 0.45; c.beginPath(); c.moveTo(x + s * 0.35, y + 1); c.lineTo(x + pts[5]![0], y + pts[5]![1]); c.lineTo(x + s * 1.1, y + 1); c.closePath(); c.fill(); c.globalAlpha = 1; // shaded side
  c.strokeStyle = dark; c.globalAlpha = 0.5; c.lineWidth = 0.6; // bedding layers in the sandstone
  for (let i = 1; i <= 2; i++) { const ly = y - h * (0.18 + i * 0.2) + (r() - 0.5) * 1.5; c.beginPath(); c.moveTo(x - s, ly); c.lineTo(x + s, ly + skew * 2); c.stroke(); }
  c.globalAlpha = 1; c.restore();
  if (r() < 0.55) { // moss over the top of many of them
    const at: [number, number, number][] = [];
    for (let i = 1; i <= 5; i++) if (r() < 0.65) at.push([x + pts[i]![0] * 0.9, y + pts[i]![1] * 0.94, s * (0.16 + r() * 0.14)]);
    moss(c, r, at);
  }
}

/** Cushions of moss at each [x, y, radius]: dark and damp underneath, bright where they catch the light on top. */
export function moss(c: Ctx, r: () => number, at: [number, number, number][]) {
  for (const [mx, my, mr] of at) for (const [col, k, oy] of [['#46612a', 1, 0.15], ['#62863a', 0.8, 0], ['#8cab4c', 0.45, -0.3]] as const) {
    c.fillStyle = col;
    for (let j = 0; j < 4; j++) {
      c.beginPath(); c.ellipse(mx + (r() - 0.5) * mr * 1.5 * k - (k < 0.5 ? mr * 0.2 : 0), my + oy * mr + (r() - 0.5) * mr * 0.4, mr * k * (0.55 + r() * 0.35), mr * k * (0.4 + r() * 0.25), 0, 0, TAU); c.fill();
    }
  }
}

/** A big old boulder sitting at (0, 0), `s` its half-width: a block of sandstone the weather has rounded off, with faint
 *  layers, a crack down its face and spots of lichen, cushions of moss over its top and trickling down its shady side,
 *  and grass (and on the big ones a fern) round its foot. */
export function drawBoulder(c: Ctx, s: number, seed: number) {
  const r = rng(seed), grey = r() < 0.45, h = s * (0.82 + r() * 0.3), lean = (r() - 0.5) * 0.25;
  const lit = grey ? '#b7b09d' : '#c6a97e', base = grey ? '#8a8576' : '#9a805c', dark = grey ? '#5f5b51' : '#6b553c';
  // the outline: a lumpy, rounded-off block, flat where it sits
  const n = 16, pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = Math.PI * (1 - i / n), cx = Math.cos(t), sy = Math.max(0, Math.sin(t)), k = 0.9 + r() * 0.16;
    pts.push([Math.sign(cx) * Math.abs(cx) ** 0.75 * s * k + lean * s * sy, -(sy ** 0.6) * h * k]);
  }
  c.fillStyle = 'rgba(35,40,20,0.3)'; c.beginPath(); c.ellipse(s * 0.12, 1, s * 1.25, s * 0.24, 0, 0, TAU); c.fill(); // its shadow
  const body = new Path2D(); body.moveTo(pts[0]![0], 0);
  for (let i = 1; i < n; i++) { const [px, py] = pts[i]!, [qx, qy] = pts[i + 1]!; body.quadraticCurveTo(px, py, (px + qx) / 2, (py + qy) / 2); }
  body.lineTo(pts[n]![0], 0); body.closePath();
  const g = c.createLinearGradient(-s * 0.6, -h, s * 0.8, 0); g.addColorStop(0, lit); g.addColorStop(0.5, base); g.addColorStop(1, dark);
  c.fillStyle = g; c.fill(body);
  c.save(); c.clip(body);
  c.strokeStyle = dark; c.lineWidth = 0.7; c.globalAlpha = 0.3; // layers in the stone
  for (let i = 1; i <= 3; i++) { const ly = -h * (0.15 + i * 0.2) + (r() - 0.5) * 2; c.beginPath(); c.moveTo(-s * 1.2, ly); c.quadraticCurveTo(0, ly + (r() - 0.5) * h * 0.12, s * 1.2, ly + (r() - 0.5) * 3); c.stroke(); }
  c.globalAlpha = 0.6; c.lineWidth = Math.max(0.8, s * 0.03); // a crack running down its face
  let kx = (r() - 0.4) * s * 0.6, ky = -h * 1.1; c.beginPath(); c.moveTo(kx, ky);
  while (ky < -h * 0.12) { kx += (r() - 0.5) * s * 0.16; ky += h * (0.1 + r() * 0.1); c.lineTo(kx, ky); }
  c.stroke(); c.globalAlpha = 1;
  for (let i = 0; i < 16; i++) { // lichen: pale grey-green rosettes and a few orange ones
    c.fillStyle = r() < 0.65 ? 'rgba(210,214,186,0.5)' : 'rgba(214,150,70,0.45)';
    c.beginPath(); c.ellipse((r() - 0.5) * s * 1.7, -r() * h * 0.85, (0.3 + r() * 0.7) * s * 0.06, (0.2 + r() * 0.5) * s * 0.05, 0, 0, TAU); c.fill();
  }
  c.fillStyle = 'rgba(40,50,20,0.25)'; // damp stain below the moss
  c.beginPath(); c.ellipse(s * 0.45, -h * 0.55, s * 0.4, h * 0.4, 0.3, 0, TAU); c.fill();
  c.restore();
  // moss: soft cushions along the top, bulging over the edge, and a few trickling down the shady side
  const at: [number, number, number][] = [];
  for (let i = 2; i <= n - 2; i++) { const [px, py] = pts[i]!; if (py < -h * 0.5 && r() < 0.8) at.push([px * 0.95, py * 0.96, s * (0.08 + r() * 0.14)]); }
  for (let i = 0; i < 6; i++) { const t = r(); at.push([s * (0.3 + t * 0.5), -h * (0.78 - t * 0.6), s * (0.06 + r() * 0.08)]); }
  if (r() < 0.5) for (let i = 0; i < 3; i++) at.push([-s * (0.3 + r() * 0.5), -h * (0.3 + r() * 0.4), s * (0.05 + r() * 0.06)]); // a few patches on the sunny side too
  moss(c, r, at);
  for (let i = 0; i < 20; i++) { // grass round its foot
    const gx = (r() - 0.5) * s * 2.3, len = s * (0.1 + r() * 0.18);
    c.strokeStyle = r() < 0.5 ? '#5f7d36' : '#7a944a'; c.lineWidth = Math.max(0.6, s * 0.025);
    c.beginPath(); c.moveTo(gx, 1); c.quadraticCurveTo(gx + (r() - 0.5) * len * 0.6, -len * 0.6, gx + (r() - 0.5) * len, -len); c.stroke();
  }
  if (s > 18) { // a little fern tucked in at one side
    const fx = (r() < 0.5 ? -1 : 1) * s * (0.8 + r() * 0.2), fl = s * (0.32 + r() * 0.12);
    c.strokeStyle = '#4f7a30'; c.lineWidth = 0.8;
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i - 2.5) * 0.42, ex = fx + Math.cos(a) * fl, ey = Math.sin(a) * fl * 0.8;
      c.beginPath(); c.moveTo(fx, 1); c.quadraticCurveTo(fx + Math.cos(a) * fl * 0.6, ey - fl * 0.2, ex, ey); c.stroke();
      for (let k = 1; k < 7; k++) {
        const t = k / 7, px = fx + (ex - fx) * t, py = 1 + (ey - 1) * t - Math.sin(t * Math.PI) * fl * 0.15, pl = fl * 0.13 * (1 - t * 0.7);
        c.beginPath(); c.moveTo(px + Math.cos(a - 1.2) * pl, py + Math.sin(a - 1.2) * pl); c.lineTo(px, py); c.lineTo(px + Math.cos(a + 1.2) * pl, py + Math.sin(a + 1.2) * pl); c.stroke();
      }
    }
  }
}
