// The Blue Mountains clearing behind the birds: sky by the real time of day, hazy blue ridges, a sandstone
// escarpment, a scribbly gum with a dead limb to perch on, a red grevillea, flannel flowers and a pond.
// Painted once into two layers (sky, then land), and again when the size or the hour changes.
import { onBranch, branchTh, type Branch, type Flower, type Tree, type World } from './sim';

type RGB = [number, number, number];
const hex = (h: string): RGB => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const css = ([r, g, b]: RGB, a = 1) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
export const mix = (a: string, b: string, t: number) => { const x = hex(a), y = hex(b); return '#' + x.map((v, i) => Math.round(v + (y[i]! - v) * t).toString(16).padStart(2, '0')).join(''); };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
function rng(seed: number) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Sky colours through the day: hour, top, horizon, distant-ridge haze, daylight (0 night … 1 day). */
const KEYS: [number, string, string, string, number][] = [
  [0, '#070c1f', '#1a2747', '#1b2641', 0], [4.8, '#070c1f', '#1a2747', '#1b2641', 0],
  [6, '#34417a', '#f3ad7c', '#6d7197', 0.45], [7.4, '#5a93cb', '#cfe4ef', '#7c9cc2', 1],
  [16.8, '#4d8ac6', '#d5e7f1', '#7d9cc3', 1], [18.4, '#3a4a80', '#f39462', '#6c6a93', 0.5],
  [19.7, '#111a39', '#383c66', '#262f50', 0.1], [24, '#070c1f', '#1a2747', '#1b2641', 0],
];
export interface Sky { top: string; hor: string; haze: string; light: number }
export function skyAt(hour: number): Sky {
  const h = ((hour % 24) + 24) % 24;
  let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1]![0] <= h) i++;
  const a = KEYS[i]!, b = KEYS[i + 1]!, t = clamp((h - a[0]) / (b[0] - a[0] || 1), 0, 1);
  return { top: mix(a[1], b[1], t), hor: mix(a[2], b[2], t), haze: mix(a[3], b[3], t), light: a[4] + (b[4] - a[4]) * t };
}

function ridge(c: CanvasRenderingContext2D, W: number, H: number, base: number, amp: number, col: string, seed: number, fuzz: number) {
  const r = rng(seed), step = 34, hs = Array.from({ length: Math.ceil(W / step) + 3 }, () => r());
  c.beginPath(); c.moveTo(0, H);
  for (let x = 0; x <= W + 3; x += 3) {
    const f = x / step, i = Math.floor(f), t = f - i, s = t * t * (3 - 2 * t);
    let v = hs[i]! + (hs[i + 1]! - hs[i]!) * s;
    v = v > 0.55 ? 0.55 + (v - 0.55) * 0.2 : v; // flat-topped plateaus
    c.lineTo(x, base - amp * v - Math.abs(Math.sin(x * 0.41 + seed * 3)) * fuzz - Math.sin(x * 1.3 + seed) * fuzz * 0.5);
  }
  c.lineTo(W, H); c.closePath(); c.fillStyle = col; c.fill();
}

/** Clusters of eucalypt leaves. */
function canopy(c: CanvasRenderingContext2D, r: () => number, x: number, y: number, rad: number, cols: string[]) {
  for (let i = 0; i < 60; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rad;
    c.save(); c.translate(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7); c.rotate(1.2 + r() * 0.8);
    c.fillStyle = cols[Math.floor(r() * cols.length)]!; c.beginPath(); c.ellipse(0, 0, 2 + r() * 3, rad * 0.09 + 2, 0, 0, Math.PI * 2); c.fill(); c.restore();
  }
}

function gum(c: CanvasRenderingContext2D, r: () => number, x: number, w: number, base: number, top: number) {
  const g = c.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  g.addColorStop(0, '#ece6d8'); g.addColorStop(0.6, '#d7cfbd'); g.addColorStop(1, '#b4a993');
  c.fillStyle = g; c.beginPath(); c.moveTo(x - w * 0.75, base); c.quadraticCurveTo(x - w * 0.5, base - w, x - w * 0.45, base - w * 2);
  c.lineTo(x - w * 0.38, top); c.lineTo(x + w * 0.42, top); c.lineTo(x + w * 0.5, base - w * 2); c.quadraticCurveTo(x + w * 0.55, base - w, x + w * 0.85, base); c.closePath(); c.fill();
  c.fillStyle = 'rgba(176,160,130,0.45)'; // shedding bark
  for (let i = 0; i < 5; i++) { c.beginPath(); c.ellipse(x + (r() - 0.5) * w * 0.6, top + r() * (base - top), w * 0.18, w * 0.5, 0, 0, Math.PI * 2); c.fill(); }
  c.strokeStyle = 'rgba(90,72,52,0.6)'; c.lineWidth = 0.9; // the scribbly gum moth's scribbles
  for (let i = 0; i < 7; i++) {
    let px = x + (r() - 0.5) * w * 0.6, py = top + r() * (base - top - 30);
    c.beginPath(); c.moveTo(px, py);
    for (let j = 0; j < 10; j++) { px = clamp(px + (r() - 0.5) * w * 0.25, x - w * 0.38, x + w * 0.38); py += 3 + r() * 3; c.lineTo(px, py); }
    c.stroke();
  }
}

export function paintSky(c: CanvasRenderingContext2D, w: World, hour: number) {
  const W = w.w, hor = w.hor, sky = skyAt(hour), r = rng(3);
  const g = c.createLinearGradient(0, 0, 0, hor); g.addColorStop(0, sky.top); g.addColorStop(1, sky.hor);
  c.fillStyle = g; c.fillRect(0, 0, W, hor + 4);
  if (sky.light < 0.55) for (let i = 0; i < 110; i++) { c.fillStyle = `rgba(255,255,255,${((0.55 - sky.light) / 0.55) * (0.25 + r() * 0.75)})`; c.fillRect(r() * W, r() * hor * 0.85, r() < 0.15 ? 1.6 : 1, r() < 0.15 ? 1.6 : 1); }
  const day = (hour - 6) / 13;
  if (day > -0.04 && day < 1.04) {
    const sx = W * (0.12 + 0.76 * clamp(day, 0, 1)), sy = hor + 6 - Math.sin(Math.PI * clamp(day, 0, 1)) * hor * 0.8, low = 1 - Math.sin(Math.PI * clamp(day, 0, 1));
    const glow = c.createRadialGradient(sx, sy, 0, sx, sy, 70); glow.addColorStop(0, `rgba(255,236,190,${0.55})`); glow.addColorStop(1, 'rgba(255,236,190,0)');
    c.fillStyle = glow; c.fillRect(sx - 70, sy - 70, 140, 140);
    c.fillStyle = mix('#fff8e2', '#ffbf7a', low); c.beginPath(); c.arc(sx, sy, 12, 0, Math.PI * 2); c.fill();
  } else {
    const mx = W * 0.8, my = hor * 0.22;
    c.fillStyle = 'rgba(240,238,228,0.95)'; c.beginPath(); c.arc(mx, my, 11, 0, Math.PI * 2); c.fill();
    c.fillStyle = sky.top; c.beginPath(); c.arc(mx + 5, my - 3, 10, 0, Math.PI * 2); c.fill();
  }
}

export function paintLand(c: CanvasRenderingContext2D, w: World, hour: number) {
  const W = w.w, H = w.h, hor = w.hor, gh = w.gh, sky = skyAt(hour), r = rng(11);
  // hazy blue ridges, furthest first
  ridge(c, W, H, hor - H * 0.1, H * 0.05, mix(sky.haze, sky.hor, 0.5), 1, 0.8);
  ridge(c, W, H, hor - H * 0.065, H * 0.045, mix(sky.haze, '#3d5b7c', 0.3), 2, 1.2);
  // the escarpment: a sandstone cliff with forest on top and a forested slope below
  const yT = hor - H * 0.135, xr = W * 0.4, faceH = H * 0.045, rock = mix('#c98b56', sky.hor, 0.18);
  c.fillStyle = mix('#35524f', sky.haze, 0.35);
  c.beginPath(); c.moveTo(-4, yT + faceH - 4); c.lineTo(xr - 6, yT + faceH - 2); c.quadraticCurveTo(xr + W * 0.12, hor - H * 0.03, xr + W * 0.3, hor); c.lineTo(-4, hor); c.closePath(); c.fill();
  c.fillStyle = rock; c.beginPath(); c.moveTo(-4, yT + 4);
  for (let x = 0; x <= xr; x += 6) c.lineTo(x, yT + 4 + Math.sin(x * 0.2) * 0.8);
  c.lineTo(xr + 4, yT + faceH * 0.55); c.lineTo(xr - 4, yT + faceH);
  for (let x = xr - 4; x >= -4; x -= 5) c.lineTo(x, yT + faceH - (r() * 3));
  c.closePath(); c.fill();
  c.save(); c.clip();
  for (let i = 0; i < 7; i++) { c.fillStyle = i % 2 ? 'rgba(255,225,170,0.18)' : 'rgba(110,60,30,0.16)'; c.fillRect(-4, yT + 4 + (i / 7) * faceH, xr + 10, faceH / 9); }
  c.strokeStyle = 'rgba(90,50,30,0.35)'; c.lineWidth = 1;
  for (let i = 0; i < 16; i++) { const x = r() * xr; c.beginPath(); c.moveTo(x, yT + 5); c.lineTo(x + (r() - 0.5) * 3, yT + faceH * (0.5 + r() * 0.5)); c.stroke(); }
  c.restore();
  ridge(c, xr + 6, yT + 6, yT + 6, 5, mix('#3e5a3d', sky.haze, 0.25), 5, 1.6); // forest along the cliff top
  // nearer forested ridge
  ridge(c, W, H, hor - H * 0.022, H * 0.03, mix('#3d5948', sky.haze, 0.3), 7, 1.5);
  // valley mist
  const m = c.createLinearGradient(0, hor - H * 0.07, 0, hor);
  m.addColorStop(0, css(hex(sky.hor), 0)); m.addColorStop(0.7, css(hex(sky.hor), 0.35)); m.addColorStop(1, css(hex(sky.hor), 0.15));
  c.fillStyle = m; c.fillRect(0, hor - H * 0.07, W, H * 0.07 + 2);
  // gums standing at the back of the clearing, hazy with distance, one with a limb to perch on
  for (const t of w.trees.filter(t => t.far)) farGum(c, r, t, sky.haze);
  limb(c, w.branches[0]!, mix('#cfc8b8', sky.haze, 0.3));
  // bush at the back of the clearing
  for (let x = -6; x < W + 8; x += 5 + r() * 7) {
    const rad = 5 + r() * 9; c.fillStyle = r() < 0.5 ? '#4b6338' : '#567044';
    c.beginPath(); c.arc(x, hor - rad * 0.4 + r() * 3, rad, 0, Math.PI * 2); c.fill();
  }
  // the clearing
  const g = c.createLinearGradient(0, hor, 0, H);
  g.addColorStop(0, '#b0ab68'); g.addColorStop(0.45, '#97a258'); g.addColorStop(1, '#6d8b40');
  c.fillStyle = g; c.fillRect(0, hor + 2, W, gh);
  c.fillStyle = 'rgba(70,90,40,0.35)'; c.fillRect(0, hor + 2, W, 4);
  for (let i = 0; i < 5; i++) { const z = r(); c.fillStyle = 'rgba(160,130,85,0.3)'; c.beginPath(); c.ellipse(r() * W, hor + gh * (0.2 + z * 0.75), 20 + z * 40, 5 + z * 9, 0, 0, Math.PI * 2); c.fill(); }
  for (let i = 0; i < Math.round(W * 2.6); i++) {
    const z = Math.pow(r(), 0.85), x = r() * W, y = hor + 4 + z * (gh - 4), len = 1.5 + 7 * z, a = -Math.PI / 2 + (r() - 0.5) * 0.9;
    c.strokeStyle = r() < 0.5 ? `rgba(205,198,128,${0.35 + r() * 0.3})` : `rgba(84,110,46,${0.35 + r() * 0.35})`;
    c.lineWidth = 0.6 + 0.7 * z; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); c.stroke();
  }
  for (let i = 0; i < 8; i++) { const z = r(), x = r() * W, y = hor + gh * (0.15 + z * 0.8); c.strokeStyle = 'rgba(105,80,52,0.7)'; c.lineWidth = 1 + z; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 8 + z * 14, y + (r() - 0.5) * 4); c.stroke(); }
  // plants along the back and the edges: a tree fern, banksia, bracken, heath, a waratah, and tussocks dotted about
  treeFern(c, r, W * 0.22, hor + gh * 0.05, 1);
  treeFern(c, r, W * 0.93, hor + gh * 0.36, 1.3);
  banksia(c, r, W * 0.5, hor + gh * 0.07, Math.max(16, W * 0.045));
  bracken(c, r, W * 0.66, hor + gh * 0.06, 46);
  bracken(c, r, W * 0.06, hor + gh * 0.5, 34);
  for (const [x, y] of [[W * 0.39, hor + gh * 0.04], [W * 0.72, hor + gh * 0.1], [W * 0.57, hor + gh * 0.12]] as const) heath(c, r, x, y);
  const wa = w.flowers[1]; if (wa) waratah(c, r, wa);
  for (let i = 0; i < 9; i++) {
    const z = r(), x = r() * W, y = hor + gh * (0.12 + z * 0.84);
    if (!w.inPond(x, y, 1.5) && !w.flowers.some(f => Math.abs(f.x - x) < f.r * 2 && Math.abs(f.y - y) < 20)) tussock(c, r, x, y, 0.6 + z * 0.9);
  }
  // flannel flowers
  for (let i = 0; i < 16; i++) {
    const z = r(), x = r() * W, y = hor + gh * (0.12 + z * 0.84); if (w.inPond(x, y, 1.3)) continue;
    const s = 1.6 + z * 2.6; c.fillStyle = '#f4f1e6';
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; c.beginPath(); c.ellipse(x + Math.cos(a) * s, y + Math.sin(a) * s * 0.7, s * 0.75, s * 0.32, a, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#b9c98a'; c.beginPath(); c.arc(x, y, s * 0.5, 0, Math.PI * 2); c.fill();
  }
  // pond
  const P = w.pond;
  c.fillStyle = '#6a5a3e'; c.beginPath(); c.ellipse(P.x, P.y + 1, P.rx * 1.07, P.ry * 1.3, 0, 0, Math.PI * 2); c.fill();
  const pg = c.createLinearGradient(0, P.y - P.ry, 0, P.y + P.ry);
  pg.addColorStop(0, mix(sky.hor, '#4b6d7a', 0.35)); pg.addColorStop(1, mix(sky.top, '#26414d', 0.45));
  c.fillStyle = pg; c.beginPath(); c.ellipse(P.x, P.y, P.rx, P.ry, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = 1;
  for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(P.x + (i - 1) * P.rx * 0.3, P.y - P.ry * 0.3 + i * P.ry * 0.25, P.rx * 0.22, 1, 0, 0, Math.PI * 2); c.stroke(); }
  for (let i = 0; i < 14; i++) { // reeds and a few cumbungi heads
    const x = P.x - P.rx * (0.95 - r() * 0.35), y = P.y - P.ry * (0.6 - r() * 0.9), h = 10 + r() * 16, bend = (r() - 0.5) * 6;
    c.strokeStyle = r() < 0.5 ? '#3f5a2a' : '#56703a'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + bend * 0.3, y - h * 0.6, x + bend, y - h); c.stroke();
    if (r() < 0.3) { c.fillStyle = '#6b4a2b'; c.beginPath(); c.ellipse(x + bend * 0.85, y - h * 0.85, 1.6, 3.4, 0, 0, Math.PI * 2); c.fill(); }
  }
  // red grevillea
  const S = w.flowers[0]!;
  for (let i = 0; i < 90; i++) {
    const a = Math.PI + r() * Math.PI, d = Math.sqrt(r()), x = S.x + Math.cos(a) * S.r * d, y = S.y + Math.sin(a) * S.r * 1.25 * d;
    c.save(); c.translate(x, y); c.rotate(r() * Math.PI); c.fillStyle = r() < 0.5 ? '#3b5634' : '#55703f';
    c.beginPath(); c.ellipse(0, 0, 4, 1.1, 0, 0, Math.PI * 2); c.fill(); c.restore();
  }
  for (let i = 0; i < 13; i++) {
    const a = Math.PI * 1.08 + r() * Math.PI * 0.84, d = 0.55 + r() * 0.45, x = S.x + Math.cos(a) * S.r * d, y = S.y + Math.sin(a) * S.r * 1.25 * d;
    c.strokeStyle = '#d8334a'; c.lineWidth = 1.1;
    for (let k = 0; k < 7; k++) { const b = -Math.PI / 2 + (k - 3) * 0.32; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(b) * 5, y + Math.sin(b) * 5 - 1, x + Math.cos(b) * 7, y + Math.sin(b) * 6 + 1.5); c.stroke(); }
    c.fillStyle = '#e9c34d'; c.beginPath(); c.arc(x, y + 1, 1, 0, Math.PI * 2); c.fill();
  }
  // the near gums: one on the left with a limb, and a scribbly gum on the right with a high limb and a dead one
  const [lt, rt] = [w.trees[3]!, w.trees[4]!];
  gum(c, r, lt.x, lt.w, lt.base, lt.top);
  limb(c, w.branches[1]!, '#d3ccbc', true);
  canopy(c, r, W * 0.03, H * 0.06, 46, ['#5b6c40', '#6f7f50', '#4a5a34']);
  gum(c, r, rt.x, rt.w, rt.base, rt.top);
  limb(c, w.branches[2]!, '#d6cfbf', true);
  limb(c, w.branches[3]!, '#cdc6b6', false, true);
  for (const [x, y, rad] of [[W * 0.9, H * 0.02, 58], [W * 0.98, H * 0.12, 48], [W * 0.78, -6, 44], [W * 1.02, -4, 60]] as [number, number, number][])
    canopy(c, r, x, y, rad, ['#5d6d41', '#73834f', '#4b5a35', '#66774a']);
}

/** A branch: tapering from the trunk to the tip, shaded underneath, optionally with a twig and a tuft of leaves at the tip. */
function limb(c: CanvasRenderingContext2D, B: Branch, col: string, leafy = false, twig = false) {
  const n = 28, pts: [number, number, number][] = [];
  for (let i = 0; i <= n; i++) { const t = i / n, [x, y] = onBranch(B, t); pts.push([x, y, branchTh(B, t)]); }
  c.fillStyle = col; c.beginPath();
  pts.forEach(([x, y, th], i) => (i ? c.lineTo(x, y - th) : c.moveTo(x, y - th)));
  for (let i = pts.length - 1; i >= 0; i--) c.lineTo(pts[i]![0], pts[i]![1] + pts[i]![2]);
  c.closePath(); c.fill();
  c.strokeStyle = 'rgba(110,98,80,0.55)'; c.lineWidth = Math.max(0.8, B.th * 0.22);
  c.beginPath(); pts.forEach(([x, y, th], i) => (i ? c.lineTo(x, y + th * 0.7) : c.moveTo(x, y + th * 0.7))); c.stroke();
  if (twig) { const [tx, ty] = pts[Math.round(n * 0.75)]!; c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.moveTo(tx, ty); c.lineTo(tx - 10, ty - 14); c.stroke(); }
  if (leafy) { const [x, y] = pts[n]!, rr = rng(Math.round(x)); canopy(c, rr, x - 4, y - 4, 14, ['#5d6d41', '#73834f', '#66774a']); }
}

/** A gum at the back of the clearing: a pale trunk forking into a few limbs, each ending in an open clump of leaves. */
function farGum(c: CanvasRenderingContext2D, r: () => number, t: Tree, haze: string) {
  const trunk = mix('#ddd5c4', haze, 0.4), leaf = [mix('#5d6d41', haze, 0.4), mix('#73834f', haze, 0.4), mix('#4b5a35', haze, 0.35)];
  const fork = t.top + (t.base - t.top) * 0.42, span = fork - t.top;
  c.fillStyle = trunk; c.beginPath();
  c.moveTo(t.x - t.w * 0.7, t.base); c.lineTo(t.x - t.w * 0.4, fork); c.lineTo(t.x + t.w * 0.4, fork); c.lineTo(t.x + t.w * 0.6, t.base); c.closePath(); c.fill();
  c.strokeStyle = trunk; c.lineCap = 'round';
  const ends = [[-0.5, 0.25], [-0.12, -0.05], [0.22, 0.1], [0.48, 0.35]].map(([dx, dy]) => [t.x + dx! * span + (r() - 0.5) * 6, t.top + dy! * span + (r() - 0.5) * 6] as const);
  for (const [ex, ey] of ends) { c.lineWidth = t.w * 0.38; c.beginPath(); c.moveTo(t.x, fork); c.quadraticCurveTo(t.x + (ex - t.x) * 0.2, (fork + ey) / 2, ex, ey); c.stroke(); }
  for (const [ex, ey] of ends) canopy(c, r, ex, ey - 2, 8 + r() * 5, leaf);
  canopy(c, r, t.x + (r() - 0.5) * span * 0.4, t.top + span * 0.12, 7, leaf);
}

/** Rough tree fern: a short dark trunk and a crown of arching fronds. */
function treeFern(c: CanvasRenderingContext2D, r: () => number, x: number, y: number, s: number) {
  const h = 24 * s;
  c.strokeStyle = '#4b3a2a'; c.lineWidth = 4.5 * s; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 1, y - h); c.stroke();
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (i - 4) * 0.36 + (r() - 0.5) * 0.15, len = (20 + r() * 8) * s;
    const ex = x + Math.cos(a) * len * 1.1, ey = y - h + Math.sin(a) * len * 0.45 + len * 0.55, cx = x + Math.cos(a) * len * 0.6, cy = y - h + Math.sin(a) * len * 0.9;
    c.strokeStyle = i % 2 ? '#4f7a35' : '#5f8a3f'; c.lineWidth = 1.4 * s;
    c.beginPath(); c.moveTo(x + 1, y - h); c.quadraticCurveTo(cx, cy, ex, ey); c.stroke();
    c.lineWidth = 0.9 * s;
    for (let k = 1; k < 7; k++) { // leaflets
      const t = k / 7, px = (1 - t) ** 2 * (x + 1) + 2 * (1 - t) * t * cx + t * t * ex, py = (1 - t) ** 2 * (y - h) + 2 * (1 - t) * t * cy + t * t * ey, l = 4 * s * (1 - t * 0.6);
      c.beginPath(); c.moveTo(px - l * 0.5, py + l * 0.6); c.lineTo(px, py); c.lineTo(px + l * 0.5, py + l * 0.6); c.stroke();
    }
  }
}

function banksia(c: CanvasRenderingContext2D, r: () => number, x: number, y: number, rad: number) {
  for (let i = 0; i < 70; i++) {
    const a = Math.PI + r() * Math.PI, d = Math.sqrt(r()), lx = x + Math.cos(a) * rad * d, ly = y + Math.sin(a) * rad * 1.1 * d;
    c.save(); c.translate(lx, ly); c.rotate(r() * Math.PI); c.fillStyle = r() < 0.5 ? '#3f5f36' : '#5c7a45';
    c.beginPath(); c.ellipse(0, 0, 4.5, 1.4, 0, 0, Math.PI * 2); c.fill(); c.restore();
  }
  for (let i = 0; i < 6; i++) { // the cones, standing up like candles
    const a = Math.PI * 1.15 + r() * Math.PI * 0.7, d = 0.5 + r() * 0.4, cx = x + Math.cos(a) * rad * d, cy = y + Math.sin(a) * rad * 1.1 * d;
    c.fillStyle = '#e3bf45'; c.beginPath(); c.ellipse(cx, cy - 4, 2.2, 5, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(150,110,30,0.6)'; c.lineWidth = 0.6; for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(cx - 2, cy - 4 + k * 2.5); c.lineTo(cx + 2, cy - 4 + k * 2.5); c.stroke(); }
  }
}

function bracken(c: CanvasRenderingContext2D, r: () => number, x: number, y: number, spread: number) {
  for (let i = 0; i < 14; i++) {
    const bx = x + (r() - 0.5) * spread, h = 8 + r() * 9, lean = (r() - 0.5) * 8;
    c.strokeStyle = r() < 0.5 ? '#6d8c3c' : '#839c48'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(bx, y); c.quadraticCurveTo(bx + lean * 0.3, y - h, bx + lean, y - h * 0.8); c.stroke();
    for (let k = 1; k < 5; k++) { const t = k / 5, px = bx + lean * t * t, py = y - h * (t * 1.2 - t * t * 0.4), l = 4 * (1 - t * 0.5); c.beginPath(); c.moveTo(px - l, py + 1.5); c.lineTo(px, py); c.lineTo(px + l, py + 1.5); c.stroke(); }
  }
}

/** A small heath bush, dotted pink like boronia. */
function heath(c: CanvasRenderingContext2D, r: () => number, x: number, y: number) {
  for (let i = 0; i < 26; i++) { const a = Math.PI + r() * Math.PI, d = Math.sqrt(r()) * 11; c.fillStyle = r() < 0.5 ? '#4e6b39' : '#62803f'; c.beginPath(); c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, 1.6, 0, Math.PI * 2); c.fill(); }
  for (let i = 0; i < 12; i++) { const a = Math.PI + r() * Math.PI, d = Math.sqrt(r()) * 10; c.fillStyle = r() < 0.6 ? '#f2a6c4' : '#e27aa5'; c.beginPath(); c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, 1.1, 0, Math.PI * 2); c.fill(); }
}

/** A waratah: a tall stem, a few toothed leaves, and the big red flower head with its ring of bracts. */
function waratah(c: CanvasRenderingContext2D, r: () => number, f: Flower) {
  const top = f.y - f.h;
  c.strokeStyle = '#3f5f2f'; c.lineWidth = 2; c.beginPath(); c.moveTo(f.x, f.y); c.quadraticCurveTo(f.x - 2, f.y - f.h * 0.5, f.x, top); c.stroke();
  for (let i = 0; i < 4; i++) { const ly = f.y - f.h * (0.2 + i * 0.17), side = i % 2 ? 1 : -1; c.save(); c.translate(f.x + side * 5, ly); c.rotate(side * 0.6); c.fillStyle = '#4d6e3a'; c.beginPath(); c.ellipse(0, 0, 6, 1.8, 0, 0, Math.PI * 2); c.fill(); c.restore(); }
  c.fillStyle = '#b0182b';
  for (let k = 0; k < 7; k++) { const a = Math.PI * 0.05 + (k / 6) * Math.PI * 0.9; c.save(); c.translate(f.x + Math.cos(a) * 6, top + 3 + Math.sin(a) * 2); c.rotate(a); c.beginPath(); c.ellipse(0, 0, 5, 2, 0, 0, Math.PI * 2); c.fill(); c.restore(); }
  c.fillStyle = '#d42536'; c.beginPath(); c.ellipse(f.x, top - 3, f.r * 0.7, f.r * 0.8, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(120,10,25,0.6)'; for (let k = 0; k < 14; k++) { const a = r() * Math.PI * 2, d = r() * f.r * 0.55; c.beginPath(); c.arc(f.x + Math.cos(a) * d, top - 3 + Math.sin(a) * d, 0.8, 0, Math.PI * 2); c.fill(); }
}

/** Spiky lomandra tussock. */
function tussock(c: CanvasRenderingContext2D, r: () => number, x: number, y: number, s: number) {
  for (let i = 0; i < 11; i++) {
    const a = -Math.PI / 2 + (i - 5) * 0.2 + (r() - 0.5) * 0.15, len = (8 + r() * 8) * s;
    c.strokeStyle = r() < 0.5 ? '#557531' : '#6e8c3e'; c.lineWidth = 1.1 * s;
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.7, x + Math.cos(a) * len * 1.1, y + Math.sin(a) * len * 0.85); c.stroke();
  }
}
