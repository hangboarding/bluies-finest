// The Blue Mountains clearing behind the birds: sky by the real time of day, hazy blue ridges, a sandstone
// escarpment, gums with branches to perch on, a pond winding away towards the horizon, and plants.
// Painted when the size or the hour changes, as layers: the sky; the land (everything lying flat or far
// away, and the branches); a sprite for each thing standing in the clearing, which is drawn in depth order
// with the birds; and the near trees' leaves, drawn over everything.
import { onBranch, branchTh, type Branch, type Prop, type World } from './sim';
import { growTree, taper, drawHollow, burrowMouth, drawShrub, drawRock, drawBoulder, drawVine, quadStalk, moss, BARKS, LEAVES } from './nature';

type RGB = [number, number, number];
type Ctx = CanvasRenderingContext2D;
const hex = (h: string): RGB => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const css = ([r, g, b]: RGB, a = 1) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
export const mix = (a: string, b: string, t: number) => { const x = hex(a), y = hex(b); return '#' + x.map((v, i) => Math.round(v + (y[i]! - v) * t).toString(16).padStart(2, '0')).join(''); };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;
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

function ridge(c: Ctx, W: number, H: number, base: number, amp: number, col: string, seed: number, fuzz: number) {
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
function canopy(c: Ctx, r: () => number, x: number, y: number, rad: number, cols: string[], n = 60) {
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * rad;
    c.save(); c.translate(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7); c.rotate(1.2 + r() * 0.8);
    c.fillStyle = cols[Math.floor(r() * cols.length)]!; c.beginPath(); c.ellipse(0, 0, 2 + r() * 3, rad * 0.09 + 2, 0, 0, TAU); c.fill(); c.restore();
  }
}
/** Gum leaves hanging from a twig's end: long, thin and drooping. */
function hangingLeaves(c: Ctx, r: () => number, x: number, y: number, n: number, cols: string[]) {
  for (let i = 0; i < n; i++) {
    const a = Math.PI / 2 + (r() - 0.5) * 1.6, len = 4 + r() * 4;
    c.save(); c.translate(x + (r() - 0.5) * 6, y + (r() - 0.5) * 3); c.rotate(a - Math.PI / 2);
    c.fillStyle = cols[Math.floor(r() * cols.length)]!; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(1.6, len * 0.5, 0.3, len); c.quadraticCurveTo(-1.2, len * 0.5, 0, 0); c.fill(); c.restore();
  }
}

/** A big gum's trunk: a flared foot, a gentle lean and sway, bulges and narrowings along the way, and scribbles. */
function gum(c: Ctx, r: () => number, x: number, w: number, base: number, top: number, vine?: { kind: number; seed: number }) {
  const g = c.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  g.addColorStop(0, '#ece6d8'); g.addColorStop(0.6, '#d7cfbd'); g.addColorStop(1, '#b4a993');
  const lean = (r() - 0.5) * w * 0.8, n = 16, L = base - top, ph = r() * 6;
  const at = (t: number) => { // centre and half-width at t (0 at the foot, 1 at the top)
    const cx = x + lean * t + Math.sin(t * 3.1 + ph) * w * 0.12, hw = w * (0.5 - 0.12 * t + 0.05 * Math.sin(t * 9 + ph * 2)) + (t < 0.12 ? w * 0.5 * (1 - t / 0.12) ** 2 : 0);
    return [cx, base - L * t, hw] as const;
  };
  c.fillStyle = g; c.beginPath();
  for (let i = 0; i <= n; i++) { const [cx, y, hw] = at(i / n); i ? c.lineTo(cx - hw, y) : c.moveTo(cx - hw, y); }
  for (let i = n; i >= 0; i--) { const [cx, y, hw] = at(i / n); c.lineTo(cx + hw, y); }
  c.closePath(); c.fill();
  c.fillStyle = 'rgba(176,160,130,0.45)'; // shedding bark
  for (let i = 0; i < 5; i++) { c.beginPath(); c.ellipse(x + (r() - 0.5) * w * 0.6, top + r() * (base - top), w * 0.18, w * 0.5, 0, 0, TAU); c.fill(); }
  c.strokeStyle = 'rgba(90,72,52,0.6)'; c.lineWidth = 0.9; // the scribbly gum moth's scribbles
  for (let i = 0; i < 7; i++) {
    let px = x + (r() - 0.5) * w * 0.6, py = top + r() * (base - top - 30);
    c.beginPath(); c.moveTo(px, py);
    for (let j = 0; j < 10; j++) { px = clamp(px + (r() - 0.5) * w * 0.25, x - w * 0.38, x + w * 0.38); py += 3 + r() * 3; c.lineTo(px, py); }
    c.stroke();
  }
  if (vine) drawVine(c, rng(vine.seed * 13 + 5), at, [], 1.3, vine.kind, Math.min(0.42, 190 / L)); // a climber up its lower trunk
}

export function paintSky(c: Ctx, w: World, hour: number) {
  const W = w.w, hor = w.hor, sky = skyAt(hour), r = rng(3);
  const g = c.createLinearGradient(0, 0, 0, hor); g.addColorStop(0, sky.top); g.addColorStop(1, sky.hor);
  c.fillStyle = g; c.fillRect(0, 0, W, hor + 4);
  if (sky.light < 0.55) for (let i = 0; i < 110; i++) { c.fillStyle = `rgba(255,255,255,${((0.55 - sky.light) / 0.55) * (0.25 + r() * 0.75)})`; c.fillRect(r() * W, r() * hor * 0.85, r() < 0.15 ? 1.6 : 1, r() < 0.15 ? 1.6 : 1); }
  const day = (hour - 6) / 13;
  if (day > -0.04 && day < 1.04) {
    const sx = W * (0.12 + 0.76 * clamp(day, 0, 1)), sy = hor + 6 - Math.sin(Math.PI * clamp(day, 0, 1)) * hor * 0.8, low = 1 - Math.sin(Math.PI * clamp(day, 0, 1));
    const glow = c.createRadialGradient(sx, sy, 0, sx, sy, 70); glow.addColorStop(0, `rgba(255,236,190,${0.55})`); glow.addColorStop(1, 'rgba(255,236,190,0)');
    c.fillStyle = glow; c.fillRect(sx - 70, sy - 70, 140, 140);
    c.fillStyle = mix('#fff8e2', '#ffbf7a', low); c.beginPath(); c.arc(sx, sy, 12, 0, TAU); c.fill();
  } else {
    const mx = W * 0.8, my = hor * 0.22;
    c.fillStyle = 'rgba(240,238,228,0.95)'; c.beginPath(); c.arc(mx, my, 11, 0, TAU); c.fill();
    c.fillStyle = sky.top; c.beginPath(); c.arc(mx + 5, my - 3, 10, 0, TAU); c.fill();
  }
}

export function paintLand(c: Ctx, w: World, hour: number) {
  const W = w.w, H = w.h, hor = w.hor, gh = w.gh, sky = skyAt(hour), r = rng(11);
  // hazy blue ridges, furthest first
  ridge(c, W, H, hor - H * 0.1, H * 0.05, mix(sky.haze, sky.hor, 0.5), 1, 0.8);
  ridge(c, W, H, hor - H * 0.065, H * 0.045, mix(sky.haze, '#3d5b7c', 0.3), 2, 1.2);
  escarpment(c, W, H, hor, sky);
  ridge(c, W, H, hor - H * 0.022, H * 0.03, mix('#3d5948', sky.haze, 0.3), 7, 1.5); // nearer forested ridge
  // valley mist
  const m = c.createLinearGradient(0, hor - H * 0.07, 0, hor);
  m.addColorStop(0, css(hex(sky.hor), 0)); m.addColorStop(0.7, css(hex(sky.hor), 0.35)); m.addColorStop(1, css(hex(sky.hor), 0.15));
  c.fillStyle = m; c.fillRect(0, hor - H * 0.07, W, H * 0.07 + 2);
  // a distant treeline: lots of small, hazy trees along the far edge of the clearing
  const fr = rng(41);
  for (let x = -10; x < W + 10; x += 6 + fr() * 14) {
    const h = H * (0.03 + fr() * 0.06);
    growTree(c, fr, { x, base: hor + 2, h, w: 1 + fr() * 1.6, bark: BARKS[Math.floor(fr() * 2)], haze: sky.haze, hazeK: 0.6, levels: 2, spread: 1.1, leafy: 1.3 });
  }
  // the forest behind the clearing: gums of every size, further ones hazier; one has a branch to perch on
  // (tall ones mostly towards the sides, smaller ones between, with gaps, so the escarpment and the ridges stay in view)
  const bg = rng(53), forest: { x: number; h: number; w: number; k: number; b: number }[] = [];
  for (let i = 0; i < 20; i++) {
    const x = bg() * W, edge = Math.min(x, W - x) / W, far = bg(), tall = edge < 0.2 && bg() < 0.65;
    if (!tall && edge > 0.3 && bg() < 0.4) continue; // a gap
    const h = H * (tall ? 0.2 + bg() * 0.16 : 0.06 + bg() * 0.11) * (1 - far * 0.3);
    forest.push({ x, h, w: Math.max(1.4, h * (0.022 + bg() * 0.022)), k: 0.38 + far * 0.32, b: Math.floor(bg() * 3) });
  }
  for (const t of w.trees.filter(t => t.far)) forest.push({ x: t.x, h: t.base - t.top, w: t.w, k: 0.4, b: 0 });
  forest.sort((a, b) => b.k - a.k); // furthest first
  for (const t of forest) growTree(c, bg, { x: t.x, base: hor + 4, h: t.h, w: t.w, bark: BARKS[t.b], haze: sky.haze, hazeK: t.k, lean: (bg() - 0.5) * 0.15, spread: 0.8 + bg() * 0.5, levels: t.h > H * 0.25 ? 4 : 3 });
  limb(c, w.branches[0]!, mix('#cfc8b8', sky.haze, 0.3), sky.haze, 0.35);
  // bush at the back of the clearing, with a few wattles in flower among it
  const wr = rng(83);
  for (let i = 0; i < 7; i++) {
    const x = wr() * W, y = hor - 2 - wr() * 4, rad = 6 + wr() * 7;
    for (let k = 0; k < 22; k++) { const a = Math.PI + wr() * Math.PI, d = Math.sqrt(wr()) * rad; c.fillStyle = mix(wr() < 0.5 ? '#5b6b44' : '#6d7a50', sky.haze, 0.3); c.beginPath(); c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 1.6, 0, TAU); c.fill(); }
    for (let k = 0; k < 16; k++) { const a = Math.PI + wr() * Math.PI, d = Math.sqrt(wr()) * rad; c.fillStyle = mix('#efc531', sky.haze, 0.25); c.beginPath(); c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.9 + wr() * 0.5, 0, TAU); c.fill(); }
  }
  for (let x = -6; x < W + 8; x += 5 + r() * 7) {
    const rad = 5 + r() * 9; c.fillStyle = r() < 0.5 ? '#4b6338' : '#567044';
    c.beginPath(); c.arc(x, hor - rad * 0.4 + r() * 3, rad, 0, TAU); c.fill();
  }
  // the clearing
  const g = c.createLinearGradient(0, hor, 0, H);
  g.addColorStop(0, '#b0ab68'); g.addColorStop(0.45, '#97a258'); g.addColorStop(1, '#6d8b40');
  c.fillStyle = g; c.fillRect(0, hor + 2, W, gh);
  c.fillStyle = 'rgba(70,90,40,0.35)'; c.fillRect(0, hor + 2, W, 4);
  for (let i = 0; i < 5; i++) { const z = r(); c.fillStyle = 'rgba(160,130,85,0.3)'; c.beginPath(); c.ellipse(r() * W, hor + gh * (0.2 + z * 0.75), 20 + z * 40, 5 + z * 9, 0, 0, TAU); c.fill(); }
  for (let i = 0; i < Math.round(W * 2.6); i++) {
    const z = Math.pow(r(), 0.85), x = r() * W, y = hor + 4 + z * (gh - 4), len = 1.5 + 7 * z, a = -Math.PI / 2 + (r() - 0.5) * 0.9;
    c.strokeStyle = r() < 0.5 ? `rgba(205,198,128,${0.35 + r() * 0.3})` : `rgba(84,110,46,${0.35 + r() * 0.35})`;
    c.lineWidth = 0.6 + 0.7 * z; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); c.stroke();
  }
  for (let i = 0; i < 8; i++) { const z = r(), x = r() * W, y = hor + gh * (0.15 + z * 0.8); if (w.inPond(x, y, 1.1)) continue; c.strokeStyle = 'rgba(105,80,52,0.7)'; c.lineWidth = 1 + z; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 8 + z * 14, y + (r() - 0.5) * 4); c.stroke(); }
  // flannel flowers
  for (let i = 0; i < 18; i++) {
    const z = r(), x = r() * W, y = hor + gh * (0.12 + z * 0.84); if (w.inPond(x, y, 1.3)) continue;
    const s = 1.6 + z * 2.6; c.fillStyle = '#f4f1e6';
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; c.beginPath(); c.ellipse(x + Math.cos(a) * s, y + Math.sin(a) * s * 0.7, s * 0.75, s * 0.32, a, 0, TAU); c.fill(); }
    c.fillStyle = '#b9c98a'; c.beginPath(); c.arc(x, y, s * 0.5, 0, TAU); c.fill();
  }
  litter(c, w);
  pond(c, r, w, sky);
  burrow(c, r, w);
  // soft shadows at the foot of everything standing in the clearing
  for (const p of w.props) {
    const rx = p.k === 'gum' || p.k === 'stag' ? p.s * 1.1 : p.k === 'fern' ? 16 * p.s : ['sheoak', 'sapling', 'wattle'].includes(p.k) ? p.s * 0.22 : ['teatree', 'banksia', 'grevillea', 'shrub'].includes(p.k) ? p.s * 1.1 : 0;
    if (!rx) continue;
    const sg = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, rx);
    sg.addColorStop(0, 'rgba(35,45,20,0.28)'); sg.addColorStop(1, 'rgba(35,45,20,0)');
    c.save(); c.translate(p.x, p.y); c.scale(1, 0.3); c.translate(-p.x, -p.y); c.fillStyle = sg; c.fillRect(p.x - rx, p.y - rx, rx * 2, rx * 2); c.restore();
  }
  // the near gums' branches (their trunks stand in the clearing, in front of the branches' roots)
  limb(c, w.branches[1]!, '#d3ccbc');
  limb(c, w.branches[2]!, '#d6cfbf');
  limb(c, w.branches[3]!, '#cdc6b6');
}

/** The escarpment: a wall of sandstone between the plateau's forest and the forested slope below. Its layers waver,
 *  thicken and thin, and change colour along the face; vertical joints crack it, lit on one side and dark on the other;
 *  ledges overhang shallow caves; water has stained it in dark and rusty streaks; plants cling to the ledges; and its
 *  end breaks away in steps of fallen blocks. */
function escarpment(c: Ctx, W: number, H: number, hor: number, sky: Sky) {
  const r = rng(71), xr = W * 0.4, fh = H * 0.058, yTop = hor - H * 0.14, tint = (s: string) => mix(s, sky.hor, 0.16);
  const wave = (x: number, k: number) => Math.sin(x * 0.045 + k) * 0.6 + Math.sin(x * 0.13 + k * 2.1) * 0.3 + Math.sin(x * 0.31 + k * 3.7) * 0.1;
  const top = (x: number) => yTop + wave(x, 1) * 1.6;
  const bot = (x: number) => yTop + fh + wave(x, 4) * 3 + wave(x * 2.7, 7) * 1.5;
  // the end, broken away in steps: [x, how far down the face]
  const steps: [number, number][] = [[xr, 0], [xr + 3, 0.16], [xr + 9, 0.2], [xr + 11, 0.48], [xr + 18, 0.55], [xr + 21, 0.82], [xr + 25, 1]];
  // the forested slope below (drawn first; the face sits on it)
  c.fillStyle = mix('#35524f', sky.haze, 0.35);
  c.beginPath(); c.moveTo(-4, bot(-4) - 3);
  for (let x = 0; x <= xr + 25; x += 4) c.lineTo(x, bot(x) - 3);
  c.quadraticCurveTo(xr + W * 0.12, hor - H * 0.03, xr + W * 0.3, hor); c.lineTo(-4, hor); c.closePath(); c.fill();
  // the face
  const face = new Path2D(); face.moveTo(-6, top(-6));
  for (let x = -6; x <= xr; x += 4) face.lineTo(x, top(x));
  for (const [x, d] of steps) face.lineTo(x, top(xr) + fh * d);
  for (let x = xr + 25; x >= -6; x -= 4) face.lineTo(x, Math.min(bot(x), top(xr) + fh + (x > xr ? 0 : 99)));
  face.closePath();
  const g = c.createLinearGradient(0, yTop, 0, yTop + fh);
  g.addColorStop(0, tint('#e6be92')); g.addColorStop(0.35, tint('#d39a63')); g.addColorStop(0.75, tint('#b77141')); g.addColorStop(1, tint('#915634'));
  c.fillStyle = g; c.fill(face);
  c.save(); c.clip(face);
  // strata: bands of uneven thickness that waver, each a different sandstone, patchy along its length
  const cols = ['#f2d2a6', '#c27a45', '#e8b27d', '#a9643a', '#dba36e', '#bfa58a', '#cf8a52'];
  const bounds: number[] = [0]; while (bounds[bounds.length - 1]! < 1) bounds.push(bounds[bounds.length - 1]! + 0.05 + r() * 0.12);
  const yb = (i: number, x: number) => top(x) + fh * (bounds[i]! + 0.035 * wave(x * 1.3, i * 2.3));
  for (let i = 0; i < bounds.length - 1; i++) {
    const col = hex(tint(cols[Math.floor(r() * cols.length)]!)), base = 0.15 + r() * 0.25;
    for (let x = -6; x < xr + 26; x += 5) {
      const a = base * (0.45 + 0.55 * (0.5 + 0.5 * wave(x * 0.8, i * 1.7 + 3)));
      c.fillStyle = css(col, a); c.beginPath(); c.moveTo(x, yb(i, x)); c.lineTo(x + 5.5, yb(i, x + 5)); c.lineTo(x + 5.5, yb(i + 1, x + 5)); c.lineTo(x, yb(i + 1, x)); c.closePath(); c.fill();
    }
  }
  // ledges: a lit lip over a shadow, broken here and there, with shallow caves under some
  const ledges = [2, Math.floor(bounds.length / 2), bounds.length - 3].filter(i => i > 0 && i < bounds.length - 1);
  for (const i of ledges) {
    for (let x = -6; x < xr + 20; x += 3) {
      if (wave(x * 0.7, i * 5) < -0.35) continue;
      c.fillStyle = 'rgba(70,40,25,0.5)'; c.fillRect(x, yb(i, x) + 0.3, 3.2, 1.1);
      c.fillStyle = 'rgba(255,236,205,0.4)'; c.fillRect(x, yb(i, x) - 0.8, 3.2, 0.8);
    }
    for (let k = 0; k < 2; k++) { const x = r() * xr, y = yb(i, x) + 2.5; c.fillStyle = 'rgba(55,32,20,0.35)'; c.beginPath(); c.ellipse(x, y, 6 + r() * 9, 1.8 + r() * 1.8, 0, 0, TAU); c.fill(); }
  }
  // water stains: dark and rusty streaks running down from the ledges
  for (let i = 0; i < 12; i++) {
    const x = r() * (xr + 10), y0 = top(x) + fh * r() * 0.5, len = fh * (0.3 + r() * 0.6), wd = 1.5 + r() * 3.5;
    c.fillStyle = r() < 0.6 ? `rgba(45,35,30,${0.12 + r() * 0.18})` : `rgba(165,72,30,${0.15 + r() * 0.2})`;
    c.beginPath(); c.moveTo(x - wd / 2, y0); c.lineTo(x + wd / 2, y0); c.quadraticCurveTo(x + wd * 0.3, y0 + len * 0.6, x + 0.4, y0 + len); c.lineTo(x - 0.4, y0 + len); c.quadraticCurveTo(x - wd * 0.3, y0 + len * 0.6, x - wd / 2, y0); c.fill();
  }
  // joints: vertical cracks, zigzagging down, dark on one side and catching the light on the other
  for (let i = 0; i < 11; i++) {
    let x = r() * xr; const y0 = top(x) + r() * fh * 0.2, y1 = y0 + fh * (0.45 + r() * 0.6), pts: [number, number][] = [[x, y0]];
    for (let y = y0 + 3; y < y1; y += 3) { x += (r() - 0.5) * 1.6; pts.push([x, y]); }
    c.strokeStyle = 'rgba(60,35,20,0.42)'; c.lineWidth = 0.85; c.beginPath(); pts.forEach(([px, py], k) => (k ? c.lineTo(px, py) : c.moveTo(px, py))); c.stroke();
    c.strokeStyle = 'rgba(255,232,195,0.3)'; c.lineWidth = 0.6; c.beginPath(); pts.forEach(([px, py], k) => (k ? c.lineTo(px + 0.9, py) : c.moveTo(px + 0.9, py))); c.stroke();
  }
  // the broken end's faces, turned away from the light
  c.fillStyle = 'rgba(80,45,25,0.3)';
  for (let k = 0; k < steps.length - 1; k += 2) { const [ax, ad] = steps[k]!, [bx] = steps[k + 1]!; c.fillRect(ax - 2, top(xr) + fh * ad, bx - ax + 2, fh); }
  c.restore();
  c.strokeStyle = 'rgba(255,240,215,0.5)'; c.lineWidth = 0.8; // the lip along the top, catching the light
  c.beginPath(); for (let x = -6; x <= xr; x += 4) (x > -6 ? c.lineTo(x, top(x) + 0.5) : c.moveTo(x, top(x) + 0.5)); c.stroke();
  // plants clinging to the ledges and the steps, and forest along the cliff top
  for (let i = 0; i < 14; i++) {
    const li = ledges[Math.floor(r() * ledges.length)] ?? 1, x = r() * xr, y = yb(li, x) - 0.5;
    c.fillStyle = r() < 0.5 ? mix('#4a6236', sky.haze, 0.2) : mix('#5b7342', sky.haze, 0.2);
    c.beginPath(); c.ellipse(x, y, 1.6 + r() * 2.2, 1.2 + r() * 1.2, 0, Math.PI, 0); c.fill();
  }
  for (const [x, d] of steps.slice(1, -1)) { c.fillStyle = mix('#4a6236', sky.haze, 0.25); c.beginPath(); c.ellipse(x + 2, top(xr) + fh * d, 3, 2, 0, Math.PI, 0); c.fill(); }
  ridge(c, xr + 4, yTop + 4, yTop + 4, 6, mix('#3e5a3d', sky.haze, 0.25), 5, 1.6);
}

/** The near gums' leaves, over everything (birds high in the trees sit among them). */
export function paintCanopy(c: Ctx, w: World) {
  const W = w.w, H = w.h, r = rng(23), lt = w.trees[3]!, rt = w.trees[4]!, bark: [string, string] = ['#e2dbcc', '#b2a994'];
  // the near gums' upper limbs, forking up into their crowns
  const fork = (x0: number, y0: number, x1: number, y1: number, wd: number, depth: number) => {
    taper(c, x0, y0, x1, y1, wd, wd * 0.6, (r() - 0.5) * Math.hypot(x1 - x0, y1 - y0) * 0.25, bark);
    if (depth <= 0) return;
    for (let i = 0; i < 2; i++) { const a = Math.atan2(y1 - y0, x1 - x0) + (i ? 0.5 : -0.45) + (r() - 0.5) * 0.3, L = Math.hypot(x1 - x0, y1 - y0) * (0.5 + r() * 0.25); fork(x1, y1, x1 + Math.cos(a) * L, y1 + Math.sin(a) * L, wd * 0.6, depth - 1); }
  };
  fork(lt.x + lt.w * 0.2, H * 0.15, W * 0.1, H * 0.04, lt.w * 0.5, 2);
  fork(lt.x, H * 0.09, -W * 0.03, -H * 0.03, lt.w * 0.45, 1);
  fork(rt.x - rt.w * 0.25, H * 0.15, W * 0.85, H * 0.05, rt.w * 0.45, 2);
  fork(rt.x - rt.w * 0.1, H * 0.07, W * 0.91, -H * 0.04, rt.w * 0.4, 1);
  canopy(c, r, W * 0.03, H * 0.06, 46, ['#5b6c40', '#6f7f50', '#4a5a34']);
  canopy(c, r, W * 0.1, H * 0.015, 30, ['#5b6c40', '#6f7f50', '#4a5a34']);
  for (const [x, y, rad] of [[W * 0.9, H * 0.02, 58], [W * 0.98, H * 0.12, 48], [W * 0.78, -6, 44], [W * 1.02, -4, 60]] as [number, number, number][])
    canopy(c, r, x, y, rad, ['#5d6d41', '#73834f', '#4b5a35', '#66774a']);
}

/** The pond: a muddy bank, water that reflects the sky, lily pads, reeds and cumbungi. */
function pond(c: Ctx, r: () => number, w: World, sky: { top: string; hor: string }) {
  const P = w.pools, y0 = Math.min(...P.map(e => e.y - e.ry)), y1 = Math.max(...P.map(e => e.y + e.ry));
  // the bank: patches of damp mud, darker wet ground and pale sand of every size, so in places the grass runs right
  // down to the water and in others there's a wide muddy or sandy edge
  for (const e of P) for (let i = 0; i < 16; i++) {
    const a = r() * TAU, x = e.x + Math.cos(a) * e.rx * 1.02, y = e.y + Math.sin(a) * e.ry * 1.08; if (w.inPond(x, y, 0.96)) continue;
    const s = w.scaleAt(y) * 1.4, kind = r();
    c.fillStyle = kind < 0.5 ? '#6b5a3d' : kind < 0.8 ? '#54472f' : '#b39b6b';
    c.beginPath(); c.ellipse(x, y + 1, (4 + r() * 10) * s, (1.4 + r() * 2.6) * s, (r() - 0.5) * 0.3, 0, TAU); c.fill();
  }
  const pg = c.createLinearGradient(0, y0, 0, y1);
  pg.addColorStop(0, mix(sky.hor, '#5a7d88', 0.3)); pg.addColorStop(1, mix(sky.top, '#26414d', 0.45));
  c.fillStyle = pg;
  for (const e of P) { c.beginPath(); c.ellipse(e.x, e.y, e.rx, e.ry, 0, 0, TAU); c.fill(); }
  // the water's edge: moss, pebbles, and grass leaning out over it
  for (const e of P) for (let i = 0; i < 10; i++) {
    const a = r() * TAU, x = e.x + Math.cos(a) * e.rx * 1.0, y = e.y + Math.sin(a) * e.ry * 1.02; if (w.inPond(x, y, 0.97) || x < 0 || x > w.w) continue;
    const s = w.scaleAt(y) * 1.4;
    const kind = r();
    if (kind < 0.25) { moss(c, r, Array.from({ length: 2 + Math.floor(r() * 3) }, () => [x + (r() - 0.5) * 10 * s, y + (r() - 0.5) * 2 * s, (1.4 + r() * 1.6) * s] as [number, number, number])); continue; } // damp moss on the bank
    if (kind < 0.6) { c.fillStyle = r() < 0.5 ? '#9a917f' : '#b7a987'; for (let k = 0; k < 4; k++) { c.beginPath(); c.ellipse(x + (r() - 0.5) * 8 * s, y + (r() - 0.5) * 2 * s, (0.6 + r()) * s, (0.4 + r() * 0.5) * s, 0, 0, TAU); c.fill(); } }
    else { c.strokeStyle = r() < 0.5 ? '#5f7d36' : '#7a944a'; c.lineWidth = 0.9; const toward = Math.sign(e.x - x) || 1; for (let k = 0; k < 6; k++) { const gx = x + (r() - 0.5) * 6 * s; c.beginPath(); c.moveTo(gx, y + 1); c.quadraticCurveTo(gx + toward * 2 * s, y - 6 * s, gx + toward * (4 + r() * 4) * s, y - (1 + r() * 3) * s); c.stroke(); } }
  }
  c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = 1;
  for (const e of P.filter((_, i) => i % 4 === 1)) { c.beginPath(); c.ellipse(e.x + (r() - 0.5) * e.rx * 0.6, e.y + (r() - 0.5) * e.ry * 0.5, e.rx * 0.25, 0.8, 0, 0, TAU); c.stroke(); }
  // water plants: duckweed gathered in the still corners, ribbonweed trailing under the surface, and water lilies in
  // groups, some in flower
  for (let i = 0; i < 9; i++) {
    const e = P[Math.floor(r() * P.length)]!, a = r() * TAU, x0 = e.x + Math.cos(a) * e.rx * 0.8, y0 = e.y + Math.sin(a) * e.ry * 0.8;
    if (!w.inPond(x0, y0, 0.95)) continue;
    const s = w.scaleAt(y0) * 1.4;
    for (let k = 0; k < 40; k++) { const x = x0 + (r() - 0.5) * 22 * s, y = y0 + (r() - 0.5) * 5 * s; if (!w.inPond(x, y, 0.97)) continue; c.fillStyle = r() < 0.5 ? '#7fa24a' : '#93b45a'; c.beginPath(); c.arc(x, y, 0.55 * s, 0, TAU); c.fill(); }
  }
  for (let i = 0; i < 10; i++) {
    const e = P[Math.floor(r() * P.length)]!, a = r() * TAU, x = e.x + Math.cos(a) * e.rx * 0.7, y = e.y + Math.sin(a) * e.ry * 0.7;
    if (!w.inPond(x, y, 0.9)) continue;
    const s = w.scaleAt(y) * 1.4, len = (14 + r() * 16) * s, dir = r() < 0.5 ? 1 : -1;
    c.strokeStyle = 'rgba(70,110,60,0.55)'; c.lineWidth = 1.1 * s;
    c.beginPath(); c.moveTo(x, y); for (let k = 1; k <= 8; k++) c.lineTo(x + dir * (k / 8) * len, y + Math.sin(k * 1.3 + i) * 1.2 * s); c.stroke();
  }
  for (let i = 0; i < 7; i++) {
    const e = P[Math.floor(r() * Math.min(P.length, 14))]!, a = r() * TAU, cx = e.x + Math.cos(a) * e.rx * 0.6, cy = e.y + Math.sin(a) * e.ry * 0.6;
    for (let k = 0; k < 3 + Math.floor(r() * 4); k++) {
      const x = cx + (r() - 0.5) * 26, y = cy + (r() - 0.5) * 7;
      if (x < 4 || !w.inPond(x, y, 0.85)) continue;
      const s = w.scaleAt(y) * (3 + r() * 2.5); c.fillStyle = r() < 0.5 ? '#4f7a3a' : '#5f8a45';
      c.beginPath(); c.ellipse(x, y, s, s * 0.4, 0, 0.35, TAU - 0.15); c.lineTo(x, y); c.fill();
      c.strokeStyle = 'rgba(30,60,30,0.4)'; c.lineWidth = 0.5; c.stroke();
      if (r() < 0.3) { c.fillStyle = r() < 0.5 ? '#f6e3ec' : '#f4f1e6'; for (let p = 0; p < 5; p++) { const pa = (p / 5) * TAU; c.beginPath(); c.ellipse(x + s * 0.3 + Math.cos(pa) * s * 0.18, y - s * 0.25 + Math.sin(pa) * s * 0.08, s * 0.16, s * 0.07, pa, 0, TAU); c.fill(); } c.fillStyle = '#f0c93a'; c.beginPath(); c.arc(x + s * 0.3, y - s * 0.25, s * 0.07, 0, TAU); c.fill(); }
    }
  }
}

/** What's lying on the ground: leaf litter (thickest under the trees), curls of shed gum bark, and fallen sticks. */
function litter(c: Ctx, w: World) {
  const r = rng(97), hor = w.hor, gh = w.gh, W = w.w;
  const trees = w.props.filter(p => ['gum', 'tree', 'sapling', 'stag', 'sheoak', 'wattle'].includes(p.k));
  const leafCols = ['#a0703e', '#b98a52', '#8c6a45', '#c9a46a', '#7d7a52', '#9a5a35', '#b6a27a'];
  const spot = (): [number, number] | null => {
    let x: number, y: number;
    if (r() < 0.6 && trees.length) { const t = trees[Math.floor(r() * trees.length)]!, a = r() * TAU, d = Math.sqrt(r()) * (t.k === 'gum' ? 60 : 34); x = t.x + Math.cos(a) * d; y = t.y + Math.sin(a) * d * 0.35; }
    else { x = r() * W; y = hor + 4 + r() * (gh - 4); }
    return y > hor + 3 && !w.inPond(x, y, 1.05) ? [x, y] : null;
  };
  for (const t of trees) for (let i = 0; i < (t.k === 'gum' ? 7 : 4); i++) { // a bed of old brown litter under each tree
    const a = r() * TAU, d = Math.sqrt(r()) * (t.k === 'gum' ? 46 : 24), x = t.x + Math.cos(a) * d, y = t.y + 2 + Math.sin(a) * d * 0.3;
    if (w.inPond(x, y, 1.1)) continue;
    const s = w.scaleAt(y) * 1.4;
    c.fillStyle = r() < 0.5 ? 'rgba(122,94,58,0.22)' : 'rgba(150,120,76,0.18)';
    c.beginPath(); c.ellipse(x, y, (8 + r() * 14) * s, (2 + r() * 3) * s, (r() - 0.5) * 0.2, 0, TAU); c.fill();
  }
  for (let i = 0; i < 520; i++) { // fallen gum leaves, long and curved, lying every which way in little drifts
    const p = spot(); if (!p) continue;
    const n = 1 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const x = p[0] + (r() - 0.5) * 8, y = p[1] + (r() - 0.5) * 2.5, s = w.scaleAt(y) * 1.4, a = r() * Math.PI, L = (2.8 + r() * 2.2) * s;
      if (w.inPond(x, y, 1.05)) continue;
      c.fillStyle = leafCols[Math.floor(r() * leafCols.length)]!; c.globalAlpha = 0.65 + r() * 0.35;
      c.save(); c.translate(x, y); c.rotate(a); c.scale(1, 0.5); c.beginPath(); c.moveTo(-L, 0); c.quadraticCurveTo(0, -L * 0.75, L, 0); c.quadraticCurveTo(0, L * 0.4, -L, 0); c.fill(); c.restore();
    }
  }
  c.globalAlpha = 1;
  for (const t of trees.filter(t => t.k === 'gum' || t.k === 'stag' || t.k === 'tree')) for (let i = 0; i < 9; i++) { // curls of shed bark under the gums
    const a = r() * TAU, d = 6 + r() * (t.k === 'gum' ? 40 : 22), x = t.x + Math.cos(a) * d, y = t.y + Math.sin(a) * d * 0.3; if (w.inPond(x, y, 1.05)) continue;
    const s = w.scaleAt(y) * 1.4, L = (4 + r() * 6) * s;
    c.strokeStyle = r() < 0.5 ? '#d8ccb2' : '#b07a4c'; c.lineWidth = 1.3 * s; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + L * 0.4, y - L * 0.35, x + L * 0.7, y + L * 0.2, x + L, y - L * 0.1); c.stroke();
  }
  for (let i = 0; i < 70; i++) { // fallen sticks and branches: mostly twigs, a few big ones, lying every which way
    const p = spot(); if (!p) continue;
    const [x, y] = p, s = w.scaleAt(y) * 1.4, big = r() ** 2, L = (3 + big * 32) * s, a = r() * TAU;
    const dx = Math.cos(a) * L, dy = Math.sin(a) * L * 0.38, ex = x + dx, ey = y + dy; // flattened, as it lies on the ground
    if (w.inPond(ex, ey, 1.05)) continue;
    const bend = (r() - 0.5) * 0.3, mx = x + dx / 2 - dy * bend, my = y + dy / 2 + dx * bend * 0.38, wd = (0.5 + r() * 0.5 + big * 1.8) * s;
    c.lineCap = 'round'; c.lineWidth = wd;
    c.strokeStyle = 'rgba(30,35,15,0.22)'; c.beginPath(); c.moveTo(x, y + wd * 0.6); c.quadraticCurveTo(mx, my + wd * 0.6, ex, ey + wd * 0.6); c.stroke(); // its shadow
    c.strokeStyle = ['#6d5a44', '#8a7a64', '#5a4a3a', '#9c907c', '#b4a891'][Math.floor(r() * 5)]!;
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(mx, my, ex, ey); c.stroke();
    const twigs = big > 0.3 ? 2 + Math.floor(r() * 3) : r() < 0.4 ? 1 : 0; // the bigger ones are forked and twiggy
    for (let k = 0; k < twigs; k++) {
      const t = 0.2 + r() * 0.65, tx = x + dx * t, ty = y + dy * t, ta = a + (r() < 0.5 ? 1 : -1) * (0.35 + r() * 0.6), tl = L * (0.15 + r() * 0.3);
      c.lineWidth = wd * (0.35 + r() * 0.25); c.beginPath(); c.moveTo(tx, ty); c.lineTo(tx + Math.cos(ta) * tl, ty + Math.sin(ta) * tl * 0.38); c.stroke();
    }
  }
}

/** A branch that looks grown rather than drawn: it wavers and tapers unevenly, with knots, peeling bark, and twigs —
 *  drooping ones with gum leaves on a living branch; broken stubs, cracks and a hollow on a dead one. */
function limb(c: Ctx, B: Branch, col: string, haze?: string, hazeK = 0) {
  const r = rng(Math.round(B.seed * 1000)), n = 44, pts: [number, number, number][] = [];
  const tint = (s: string) => (haze ? mix(s, haze, hazeK) : s), leaves = [tint('#5d6d41'), tint('#73834f'), tint('#66774a'), tint('#839066')];
  for (let i = 0; i <= n; i++) { const t = i / n, [x, y] = onBranch(B, t); pts.push([x, y, branchTh(B, t)]); }
  const at = (t: number) => pts[Math.round(clamp(t, 0, 1) * n)]!;
  // side branches first, so the limb covers where they join. A living limb sends up one branch that forks and forks
  // again towards the light, and lets others droop with leaves; a dead one has only snapped-off stubs.
  const barkCol: [string, string] = [col, tint('#9b927f')];
  const grow = (x: number, y: number, a: number, len: number, wd: number, lv: number) => {
    const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
    taper(c, x, y, ex, ey, wd, wd * 0.6, (r() - 0.5) * len * 0.3, barkCol);
    if (lv <= 0 || wd < 0.9) { hangingLeaves(c, r, ex, ey, 10, leaves); canopy(c, r, ex, ey - 2, Math.max(5, len * 0.45), leaves, 18); return; }
    for (let i = 0; i < 2; i++) grow(ex, ey, a + (i ? 0.45 : -0.5) + (r() - 0.5) * 0.4, len * (0.55 + r() * 0.2), wd * 0.62, lv - 1);
  };
  const side = B.dead ? 3 : 4;
  for (let i = 0; i < side; i++) {
    const t = 0.3 + (i / side) * 0.6 + r() * 0.06, [x, y, th] = at(t), [x2, y2] = at(t + 0.05), dir = Math.atan2(y2 - y, x2 - x);
    if (B.dead) { // a stub where a branch snapped off
      const a = dir - (0.7 + r() * 0.6), len = (5 + r() * 6) * (B.th / 4.5), ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
      taper(c, x, y, ex, ey, th * 0.9, th * 0.6, (r() - 0.5) * 3, barkCol);
      c.fillStyle = tint('#e8e2d4'); c.beginPath(); c.ellipse(ex, ey, th * 0.3, th * 0.18, a, 0, TAU); c.fill(); // the broken end, paler wood
      continue;
    }
    const up = i === side - 2;
    grow(x, y, dir + (up ? -(0.8 + r() * 0.4) : 0.7 + r() * 0.5), (up ? 22 : 13) * (B.th / 4.5) * (0.8 + r() * 0.4), th * (up ? 1.1 : 0.75), up ? 2 : 1);
  }
  // the branch itself
  c.fillStyle = col; c.beginPath();
  pts.forEach(([x, y, th], i) => (i ? c.lineTo(x, y - th) : c.moveTo(x, y - th)));
  for (let i = pts.length - 1; i >= 0; i--) c.lineTo(pts[i]![0], pts[i]![1] + pts[i]![2]);
  c.closePath(); c.fill();
  c.save(); c.clip();
  c.strokeStyle = 'rgba(95,82,64,0.4)'; c.lineWidth = B.th * 0.9; // shade underneath
  c.beginPath(); pts.forEach(([x, y, th], i) => (i ? c.lineTo(x, y + th * 0.9) : c.moveTo(x, y + th * 0.9))); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = Math.max(0.7, B.th * 0.25); // light along the top
  c.beginPath(); pts.forEach(([x, y, th], i) => (i ? c.lineTo(x, y - th * 0.55) : c.moveTo(x, y - th * 0.55))); c.stroke();
  for (let i = 0; i < 6; i++) { // bark: rusty peeling patches on a living branch, long cracks on a dead one
    const t = 0.05 + r() * 0.85, [x, y, th] = at(t), [x2, y2] = at(t + 0.08);
    if (B.dead) { c.strokeStyle = 'rgba(80,70,58,0.55)'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(x, y + (r() - 0.5) * th); c.lineTo(x2, y2 + (r() - 0.5) * th); c.stroke(); }
    else { c.fillStyle = r() < 0.5 ? 'rgba(185,135,85,0.35)' : 'rgba(150,160,130,0.3)'; c.save(); c.translate(x, y); c.rotate(Math.atan2(y2 - y, x2 - x)); c.beginPath(); c.ellipse(0, (r() - 0.5) * th * 0.6, th * 1.8, th * 0.45, 0, 0, TAU); c.fill(); c.restore(); }
  }
  c.restore();
  for (let i = 0; i < 2; i++) { // knots: faint, stretched along the grain
    const t = 0.2 + r() * 0.6, [x, y, th] = at(t), [x2, y2] = at(t + 0.04), a = Math.atan2(y2 - y, x2 - x);
    c.strokeStyle = 'rgba(110,96,76,0.45)'; c.lineWidth = 0.7;
    for (const k of [0.55, 1]) { c.beginPath(); c.ellipse(x, y + th * 0.1, th * 1.1 * k, th * 0.32 * k, a, 0, TAU); c.stroke(); }
  }
  if (B.dead) { // snapped off at the end, where rot has hollowed it out: a ragged ring of pale wood round a dark pipe
    const [x, y, th] = at(1), [px, py] = at(0.96), a = Math.atan2(y - py, x - px);
    c.save(); c.translate(x, y); c.rotate(a);
    c.fillStyle = tint('#e6dfd0'); c.beginPath(); c.moveTo(0, -th); for (let i = 0; i <= 6; i++) c.lineTo((i % 2 ? 2.2 : 0.4) + r(), -th + (i / 6) * th * 2); c.lineTo(-1, th); c.closePath(); c.fill();
    c.fillStyle = '#1d1610'; c.beginPath(); c.ellipse(1, 0, th * 0.32, th * 0.62, 0, 0, TAU); c.fill();
    c.restore();
  } else { const [x, y] = at(1); hangingLeaves(c, r, x, y, 12, leaves); canopy(c, r, x + 2, y - 3, 9, leaves, 22); } // leafy at the tip
}

// ---------- things standing in the clearing, each painted once into its own sprite ----------
export interface Sprite { cv: HTMLCanvasElement; ox: number; oy: number; w: number; h: number }
/** How far each kind of prop reaches from its base: left, top, right, bottom. */
function box(p: Prop, w: World): [number, number, number, number] {
  const s = p.s;
  switch (p.k) {
    case 'gum': return [-s * 1.35, -(p.y + 12), s * 1.35, 4];
    case 'fern': return [-38 * s, -60 * s, 38 * s, 4];
    case 'sheoak': return [-0.45 * s, -1.1 * s, 0.45 * s, 4];
    case 'sapling': return [-0.5 * s, -1.12 * s, 0.5 * s, 4];
    case 'wattle': return [-0.62 * s, -1.1 * s, 0.62 * s, 4];
    case 'teatree': case 'banksia': case 'grevillea': return [-1.5 * s, -1.7 * s, 1.5 * s, 4];
    case 'waratah': { const f = w.flowers[1]!; return [-18, -(f.h + 16), 18, 4]; }
    case 'heath': return [-16, -16, 16, 3];
    case 'bracken': return [-s / 2 - 12, -26, s / 2 + 12, 3];
    case 'tussock': return [-22 * s, -20 * s, 22 * s, 3];
    case 'stag': return [-s * 1.6, -(w.stag.h + 14), w.stag.px - w.stag.x + 12, 4];
    case 'tree': return [-0.7 * s, -1.15 * s, 0.7 * s, 4];
    case 'shrub': return [-1.45 * s, -1.75 * s, 1.45 * s, 4];
    case 'rock': case 'wetrock': return [-1.6 * s, -1.15 * s, 1.7 * s, 0.6 * s + 1.5];
    case 'grass': return [-26 * s, -34 * s, 26 * s, 3];
    case 'reeds': return [-16 * s, -44 * s, 16 * s, 3];
    case 'log': return [-s * 0.64, -s * 0.62, s * 0.64, s * 0.34 + 3];
    case 'boulder': return [-1.6 * s, -1.6 * s, 1.6 * s, 0.32 * s + 3];
    default: return [0, 0, 0, 0];
  }
}
function drawProp(c: Ctx, p: Prop, w: World) {
  const r = rng(p.seed * 7 + 3), s = p.s;
  switch (p.k) {
    case 'gum': gum(c, r, 0, s, 0, -(p.y + 10), { kind: p.x < w.w / 2 ? 2 : 1, seed: p.seed }); break; // hardenbergia up the left one, clematis the right
    case 'fern': treeFern(c, r, 0, 0, s); break;
    case 'sheoak': sheoak(c, r, s); break;
    case 'sapling': sapling(c, r, s); break;
    case 'wattle': wattle(c, r, s); break;
    case 'teatree': teatree(c, r, s); break;
    case 'banksia': banksia(c, r, 0, 0, s); break;
    case 'grevillea': grevillea(c, r, s); break;
    case 'waratah': waratah(c, r, w.flowers[1]!.h, w.flowers[1]!.r); break;
    case 'heath': heath(c, r, 0, 0); break;
    case 'bracken': bracken(c, r, 0, 0, s); break;
    case 'tussock': tussock(c, r, 0, 0, s); break;
    case 'stag': stag(c, r, w); break;
    case 'shrub': drawShrub(c, s, p.seed); break;
    case 'rock': drawRock(c, 0, 0, s, p.seed); break;
    case 'wetrock': { // a boulder in the shallows: the water hides its foot, with a ripple round it
      drawRock(c, 0, 0, s, p.seed);
      c.fillStyle = 'rgba(88,122,134,0.85)'; c.beginPath(); c.ellipse(0, 0.2 * s, 1.55 * s, 0.42 * s, 0, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 0.8; c.beginPath(); c.ellipse(0, -0.12 * s, 1.25 * s, 0.26 * s, 0, 0.15, Math.PI - 0.15); c.stroke();
      break;
    }
    case 'grass': nativeGrass(c, r, s); break;
    case 'reeds': reeds(c, r, s); break;
    case 'log': fallenLog(c, r, s, p.a ?? 0); break;
    case 'boulder': drawBoulder(c, s, p.seed); break;
    case 'tree': { // a gum in the middle of the clearing: each one its own size, shape and bark
      const b = BARKS[p.seed % BARKS.length]!;
      const vine = s > w.h * 0.15 ? { kind: [1, 1, 0, 2, 2][p.seed % 5]!, seed: p.seed * 31 + 7 } : undefined; // climbers on the bigger ones
      growTree(c, r, { x: 0, base: 0, h: s, w: Math.max(2.5, s * (0.035 + r() * 0.025)), bark: b, leaves: LEAVES, lean: (r() - 0.5) * 0.2, spread: 0.8 + r() * 0.5, levels: s > 120 ? 4 : 3, vine });
      break;
    }
  }
}

/** The old stag: a dead gum, silver and cracked, its trunk swelling and narrowing as it goes up, its top split into two
 *  snapped-off leaders. Broken limbs stick out (the owl sits on the upper one), and the hollow has opened where a big
 *  limb came off long ago, inside a collar of rolled bark. */
function stag(c: Ctx, r: () => number, w: World) {
  const S = w.stag, s = S.w, H = S.h, hx = S.hx - S.x, hy = S.hy - S.y, px = S.px - S.x, py = S.py - S.y;
  const bark: [string, string] = ['#cfc9bc', '#9b9588'], pale = '#e9e3d6';
  const n = 16, top = 0.86;
  const at = (t: number) => { const cx = s * 0.12 * t + Math.sin(t * 2.6 + 1.7) * s * 0.08, hw = s * (0.5 - 0.14 * t + 0.05 * Math.sin(t * 8 + 3)) + (t < 0.1 ? s * 0.45 * (1 - t / 0.1) ** 2 : 0); return [cx, -H * top * t, hw] as const; };
  // a lower broken limb on the left, and the owl's limb up on the right (drawn first so the trunk covers their roots)
  const [lx, ly] = at(0.45); taper(c, lx, ly, lx - s * 0.95, ly - H * 0.08, s * 0.34, s * 0.24, -3, bark);
  c.fillStyle = pale; c.beginPath(); c.ellipse(lx - s * 0.95, ly - H * 0.08, s * 0.07, s * 0.12, -0.3, 0, TAU); c.fill();
  const lw = s * 0.3, [ox] = at(0.8); taper(c, ox, py + lw * 0.6, px + 2, py + lw * 0.42, lw * 1.1, lw * 0.85, 2, bark);
  c.fillStyle = pale; c.beginPath(); for (let i = 0; i <= 5; i++) c.lineTo(px + 2 + (i % 2 ? 2.5 : 0), py + (i / 5) * lw * 0.85); c.lineTo(px, py + lw * 0.85); c.closePath(); c.fill();
  // the trunk
  const g = c.createLinearGradient(-s / 2, 0, s / 2, 0); g.addColorStop(0, '#d6d0c3'); g.addColorStop(0.55, '#bab4a7'); g.addColorStop(1, '#8e887c');
  c.fillStyle = g; c.beginPath();
  for (let i = 0; i <= n; i++) { const [cx, y, hw] = at(i / n); i ? c.lineTo(cx - hw, y) : c.moveTo(cx - hw, y); }
  for (let i = n; i >= 0; i--) { const [cx, y, hw] = at(i / n); c.lineTo(cx + hw, y); }
  c.closePath(); c.fill();
  // the split top: two leaders, both snapped off with splintered ends
  const [tx, ty, thw] = at(1);
  for (const [dx, h, wd] of [[-0.3, 0.16, 0.62], [0.32, 0.08, 0.5]] as const) {
    const ex = tx + dx * s * 1.4, ey = ty - H * h;
    taper(c, tx + dx * thw, ty + 2, ex, ey, thw * wd * 2, thw * wd * 1.5, (r() - 0.5) * 4, bark);
    c.fillStyle = pale; c.beginPath(); const hw = thw * wd * 0.75;
    c.moveTo(ex - hw, ey + 1); for (let i = 0; i <= 6; i++) c.lineTo(ex - hw + (i / 6) * hw * 2, ey - (i % 2 ? 3 + r() * 5 : r() * 1.5)); c.lineTo(ex + hw, ey + 1); c.closePath(); c.fill();
  }
  // cracks running up it, and a little bark left at the foot
  c.strokeStyle = 'rgba(85,78,66,0.5)'; c.lineWidth = 0.8;
  for (let i = 0; i < 10; i++) { const t = r() * 0.95, [cx, y, hw] = at(t), x = cx + (r() - 0.5) * hw * 1.4; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + (r() - 0.5) * 3, y - 10, x + (r() - 0.5) * 2, y - 12 - r() * 26); c.stroke(); }
  c.fillStyle = 'rgba(110,84,58,0.5)'; for (let i = 0; i < 4; i++) { const [cx, y, hw] = at(r() * 0.12); c.beginPath(); c.ellipse(cx + (r() - 0.5) * hw * 1.4, y - 2, s * 0.12, s * 0.28, 0, 0, TAU); c.fill(); }
  drawHollow(c, hx, hy, S.hrx, S.hry, S.hseed, bark);
  // wonga vine up its lower trunk and out along the broken limb, well below the owl's hollow
  drawVine(c, rng(733), at, [quadStalk(lx, ly, lx - s * 0.95, ly - H * 0.08, s * 0.34, s * 0.24, -3)], clamp(s / 30, 0.8, 1.4), 0, 0.5);
}

/** The wombat's burrow: dug into a low, grassy bank, an arched mouth (flat along the bottom) under an overhanging lip of
 *  soil and grass with a few roots hanging down, and a fan of dug-out earth spilling across the grass in front. */
function burrow(c: Ctx, r: () => number, w: World) {
  const B = w.burrow, k = w.U * w.scaleAt(B.y), x = B.x, y = B.y;
  // the bank: grass over the top, rising gently from the left and falling away past the mouth
  const bank = new Path2D();
  bank.moveTo(x - 90 * k, y + 2 * k);
  bank.bezierCurveTo(x - 70 * k, y - 20 * k, x - 40 * k, y - 36 * k, x - 12 * k, y - 33 * k);
  bank.bezierCurveTo(x + 6 * k, y - 31 * k, x + 18 * k, y - 18 * k, x + 24 * k, y + 2 * k);
  bank.closePath();
  const bg = c.createLinearGradient(0, y - 36 * k, 0, y + 2 * k); bg.addColorStop(0, '#9aa85c'); bg.addColorStop(0.45, '#8e9a52'); bg.addColorStop(1, '#7d8a46');
  c.fillStyle = bg; c.fill(bank);
  c.save(); c.clip(bank);
  c.strokeStyle = 'rgba(70,90,40,0.5)'; c.lineWidth = 0.8; // grass on the bank
  for (let i = 0; i < 40; i++) { const gx = x + (r() - 0.65) * 100 * k, gy = y - r() * 34 * k; c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx + (r() - 0.5) * 2, gy - 2 - r() * 3 * k); c.stroke(); }
  // bare, dug earth round the mouth
  c.fillStyle = '#806446'; c.beginPath(); c.ellipse(x - 5 * k, y - 9 * k, 22 * k, 17 * k, -0.15, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(160,128,90,0.6)'; for (let i = 0; i < 12; i++) { c.beginPath(); c.arc(x - 5 * k + (r() - 0.5) * 34 * k, y - 9 * k + (r() - 0.5) * 26 * k, (0.6 + r()) * k, 0, Math.PI * 2); c.fill(); }
  c.restore();
  // the mouth: dark, darkest where it goes back into the bank
  const mouth = burrowMouth(x, y, k), mg = c.createLinearGradient(x - 19 * k, 0, x + 9 * k, 0);
  mg.addColorStop(0, '#0c0806'); mg.addColorStop(0.65, '#1b130d'); mg.addColorStop(1, '#2e2219');
  c.fillStyle = mg; c.fill(mouth);
  c.save(); c.clip(mouth); c.fillStyle = 'rgba(0,0,0,0.45)'; c.beginPath(); c.ellipse(x - 7 * k, y - 23 * k, 16 * k, 7 * k, 0, 0, Math.PI * 2); c.fill(); c.restore(); // the lip's shadow
  // the lip: soil and grass hanging over the top, with roots dangling into the mouth
  c.fillStyle = '#6b5238'; c.beginPath(); c.ellipse(x - 6 * k, y - 23.5 * k, 17 * k, 2.6 * k, -0.05, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#6f8a3c'; c.lineWidth = 0.9;
  for (let i = 0; i < 14; i++) { const gx = x - 21 * k + r() * 30 * k, gy = y - 25 * k + r() * 1.5 * k; c.beginPath(); c.moveTo(gx, gy); c.quadraticCurveTo(gx + (r() - 0.5) * 3, gy + 2 * k, gx + (r() - 0.5) * 4, gy + (2 + r() * 3) * k); c.stroke(); }
  c.strokeStyle = 'rgba(120,88,58,0.85)'; c.lineWidth = Math.max(0.6, 0.5 * k);
  for (let i = 0; i < 3; i++) { const rx = x - 14 * k + r() * 18 * k, ry = y - 22 * k; c.beginPath(); c.moveTo(rx, ry); c.bezierCurveTo(rx + 2 * k, ry + 4 * k, rx - 2 * k, ry + 7 * k, rx + (r() - 0.5) * 3 * k, ry + (6 + r() * 5) * k); c.stroke(); }
  // the spoil: loose earth fanning out over the grass in front, with clods and scrape marks
  const spoil = new Path2D(); spoil.moveTo(x - 16 * k, y + 1 * k);
  for (let i = 0; i <= 10; i++) { const a = Math.PI * (i / 10), rr = 1 + (r() - 0.5) * 0.25; spoil.lineTo(x + 6 * k + Math.cos(Math.PI - a) * 30 * k * rr, y + 2 * k + Math.sin(a) * 9 * k * rr); }
  spoil.closePath();
  c.fillStyle = '#9b7d56'; c.fill(spoil);
  c.save(); c.clip(spoil);
  c.fillStyle = 'rgba(80,62,42,0.5)'; for (let i = 0; i < 16; i++) { c.beginPath(); c.ellipse(x + (r() - 0.4) * 50 * k, y + 2 * k + r() * 8 * k, (0.8 + r() * 1.4) * k, (0.5 + r() * 0.8) * k, 0, 0, Math.PI * 2); c.fill(); }
  c.strokeStyle = 'rgba(70,52,34,0.45)'; c.lineWidth = 0.6;
  for (let i = 0; i < 5; i++) { const sx = x + 4 * k + r() * 18 * k, sy = y + 3 * k + r() * 5 * k; c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + 6 * k, sy + 1.5 * k); c.stroke(); }
  c.restore();
}
/** A sprite per prop (none for rocks, which are drawn as they go), at the screen's pixel density. */
export function paintProps(w: World, dpr: number): (Sprite | null)[] {
  return w.props.map(p => {
    const [l, t, rr, b] = box(p, w), cw = Math.ceil((rr - l) * dpr), ch = Math.ceil((b - t) * dpr);
    if (cw <= 0 || ch <= 0) return null;
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    const c = cv.getContext('2d'); if (!c) return null;
    c.scale(dpr, dpr); c.translate(-l, -t); drawProp(c, p, w);
    return { cv, ox: l, oy: t, w: rr - l, h: b - t };
  });
}

/** Rough tree fern: a short dark trunk and a crown of arching fronds. */
function treeFern(c: Ctx, r: () => number, x: number, y: number, s: number) {
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

/** A she-oak: a dark, slightly leaning trunk and weeping, needle-fine foliage. */
function sheoak(c: Ctx, r: () => number, H: number) {
  c.strokeStyle = '#5a4636'; c.lineCap = 'round'; c.lineWidth = Math.max(2.5, H * 0.045);
  c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-H * 0.04, -H * 0.4, H * 0.03, -H * 0.72); c.stroke();
  const tips: [number, number][] = [];
  for (let i = 0; i < 5; i++) {
    const y0 = -H * (0.4 + i * 0.08), side = i % 2 ? 1 : -1, ex = side * H * (0.18 + r() * 0.16), ey = y0 - H * (0.1 + r() * 0.12);
    c.lineWidth = Math.max(1, H * 0.018); c.beginPath(); c.moveTo(0, y0); c.quadraticCurveTo(ex * 0.5, y0 - H * 0.08, ex, ey); c.stroke();
    tips.push([ex, ey]);
  }
  tips.push([H * 0.03, -H * 0.85]);
  for (const [tx, ty] of tips) for (let k = 0; k < 22; k++) { // weeping strands
    const x = tx + (r() - 0.5) * H * 0.2, y = ty + (r() - 0.5) * H * 0.1, len = H * (0.08 + r() * 0.12), lean = (r() - 0.5) * 4;
    c.strokeStyle = r() < 0.5 ? '#4b5c45' : '#5f7255'; c.lineWidth = 0.9;
    c.beginPath(); c.moveTo(x, y - len * 0.3); c.quadraticCurveTo(x + lean, y + len * 0.2, x + lean * 1.4, y + len); c.stroke();
  }
}

/** A young gum: a thin pale trunk with a gentle bend, a few spindly branches and open clumps of leaves (some still the bluish juvenile ones). */
function sapling(c: Ctx, r: () => number, H: number) {
  const tw = Math.max(2.5, H * 0.04), leaf = ['#5d6d41', '#73834f', '#7f9a8c', '#66774a'];
  c.fillStyle = '#ddd5c3';
  c.beginPath(); c.moveTo(-tw, 0); c.quadraticCurveTo(-tw * 0.6 + H * 0.05, -H * 0.5, H * 0.02 - tw * 0.3, -H * 0.85); c.lineTo(H * 0.02 + tw * 0.3, -H * 0.85); c.quadraticCurveTo(tw * 0.6 + H * 0.05, -H * 0.5, tw, 0); c.closePath(); c.fill();
  c.strokeStyle = '#d4cbb8'; c.lineCap = 'round';
  const ends: [number, number][] = [];
  for (let i = 0; i < 4; i++) {
    const y0 = -H * (0.45 + i * 0.11), side = i % 2 ? 1 : -1, ex = side * H * (0.16 + r() * 0.18), ey = y0 - H * (0.08 + r() * 0.1);
    c.lineWidth = Math.max(1, tw * 0.5); c.beginPath(); c.moveTo(H * 0.03, y0); c.quadraticCurveTo(ex * 0.4, y0 - 4, ex, ey); c.stroke();
    ends.push([ex, ey]);
  }
  ends.push([H * 0.02, -H * 0.92]);
  for (const [x, y] of ends) { canopy(c, r, x, y, H * 0.09, leaf, 26); hangingLeaves(c, r, x, y + 3, 6, leaf); }
}

/** A golden wattle: a few thin stems, fine grey-green foliage, covered in golden puffballs. */
function wattle(c: Ctx, r: () => number, H: number) {
  c.strokeStyle = '#4e4236'; c.lineCap = 'round';
  const tops: [number, number][] = [];
  for (const lean of [-0.3, 0.05, 0.35]) {
    const ex = lean * H, ey = -H * (0.55 + r() * 0.15);
    c.lineWidth = Math.max(1.5, H * 0.03); c.beginPath(); c.moveTo(lean * 4, 0); c.quadraticCurveTo(ex * 0.3, ey * 0.5, ex, ey); c.stroke();
    tops.push([ex, ey]);
  }
  for (const [x, y] of tops) canopy(c, r, x, y - H * 0.1, H * 0.3, ['#556b3c', '#64794a', '#4c5f38'], 70);
  canopy(c, r, 0, -H * 0.78, H * 0.28, ['#556b3c', '#64794a', '#4c5f38'], 60);
  for (let i = 0; i < 70; i++) { // the puffballs
    const [x, y] = tops[Math.floor(r() * tops.length)]!, a = r() * TAU, d = Math.sqrt(r()) * H * 0.33;
    c.fillStyle = r() < 0.5 ? '#f2c230' : '#f7d64c'; c.beginPath(); c.arc(x + Math.cos(a) * d, y - H * 0.12 + Math.sin(a) * d * 0.75, 1.2 + r() * 0.8, 0, TAU); c.fill();
  }
}

/** Tea-tree: a rounded, dark bush starred with tiny white flowers. */
function teatree(c: Ctx, r: () => number, R: number) {
  c.strokeStyle = '#4b3c2e'; c.lineWidth = 1.5; for (const d of [-0.4, 0, 0.4]) { c.beginPath(); c.moveTo(d * 3, 0); c.lineTo(d * R, -R * 0.6); c.stroke(); }
  for (let i = 0; i < 110; i++) {
    const a = Math.PI + r() * Math.PI, d = Math.sqrt(r()), x = Math.cos(a) * R * 1.2 * d, y = -R * 0.55 + Math.sin(a) * R * 0.95 * d;
    c.fillStyle = r() < 0.5 ? '#3d5634' : '#4f6b40'; c.beginPath(); c.arc(x, y, 1.6, 0, TAU); c.fill();
  }
  c.fillStyle = '#f5f3ea';
  for (let i = 0; i < 40; i++) { const a = Math.PI + r() * Math.PI, d = Math.sqrt(r()), x = Math.cos(a) * R * 1.15 * d, y = -R * 0.55 + Math.sin(a) * R * 0.9 * d; c.beginPath(); c.arc(x, y, 1, 0, TAU); c.fill(); }
}

function banksia(c: Ctx, r: () => number, x: number, y: number, rad: number) {
  for (let i = 0; i < 70; i++) {
    const a = Math.PI + r() * Math.PI, d = Math.sqrt(r()), lx = x + Math.cos(a) * rad * d, ly = y + Math.sin(a) * rad * 1.1 * d;
    c.save(); c.translate(lx, ly); c.rotate(r() * Math.PI); c.fillStyle = r() < 0.5 ? '#3f5f36' : '#5c7a45';
    c.beginPath(); c.ellipse(0, 0, 4.5, 1.4, 0, 0, TAU); c.fill(); c.restore();
  }
  for (let i = 0; i < 6; i++) { // the cones, standing up like candles
    const a = Math.PI * 1.15 + r() * Math.PI * 0.7, d = 0.5 + r() * 0.4, cx = x + Math.cos(a) * rad * d, cy = y + Math.sin(a) * rad * 1.1 * d;
    c.fillStyle = '#e3bf45'; c.beginPath(); c.ellipse(cx, cy - 4, 2.2, 5, 0, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(150,110,30,0.6)'; c.lineWidth = 0.6; for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(cx - 2, cy - 4 + k * 2.5); c.lineTo(cx + 2, cy - 4 + k * 2.5); c.stroke(); }
  }
}

/** Red grevillea: narrow dark leaves and red spider flowers. */
function grevillea(c: Ctx, r: () => number, R: number) {
  for (let i = 0; i < 90; i++) {
    const a = Math.PI + r() * Math.PI, d = Math.sqrt(r()), x = Math.cos(a) * R * d, y = Math.sin(a) * R * 1.25 * d;
    c.save(); c.translate(x, y); c.rotate(r() * Math.PI); c.fillStyle = r() < 0.5 ? '#3b5634' : '#55703f';
    c.beginPath(); c.ellipse(0, 0, 4, 1.1, 0, 0, TAU); c.fill(); c.restore();
  }
  for (let i = 0; i < 13; i++) {
    const a = Math.PI * 1.08 + r() * Math.PI * 0.84, d = 0.55 + r() * 0.45, x = Math.cos(a) * R * d, y = Math.sin(a) * R * 1.25 * d;
    c.strokeStyle = '#d8334a'; c.lineWidth = 1.1;
    for (let k = 0; k < 7; k++) { const b = -Math.PI / 2 + (k - 3) * 0.32; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(b) * 5, y + Math.sin(b) * 5 - 1, x + Math.cos(b) * 7, y + Math.sin(b) * 6 + 1.5); c.stroke(); }
    c.fillStyle = '#e9c34d'; c.beginPath(); c.arc(x, y + 1, 1, 0, TAU); c.fill();
  }
}

function bracken(c: Ctx, r: () => number, x: number, y: number, spread: number) {
  for (let i = 0; i < 14; i++) {
    const bx = x + (r() - 0.5) * spread, h = 8 + r() * 9, lean = (r() - 0.5) * 8;
    c.strokeStyle = r() < 0.5 ? '#6d8c3c' : '#839c48'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(bx, y); c.quadraticCurveTo(bx + lean * 0.3, y - h, bx + lean, y - h * 0.8); c.stroke();
    for (let k = 1; k < 5; k++) { const t = k / 5, px = bx + lean * t * t, py = y - h * (t * 1.2 - t * t * 0.4), l = 4 * (1 - t * 0.5); c.beginPath(); c.moveTo(px - l, py + 1.5); c.lineTo(px, py); c.lineTo(px + l, py + 1.5); c.stroke(); }
  }
}

/** A small heath bush, dotted pink like boronia. */
function heath(c: Ctx, r: () => number, x: number, y: number) {
  for (let i = 0; i < 26; i++) { const a = Math.PI + r() * Math.PI, d = Math.sqrt(r()) * 11; c.fillStyle = r() < 0.5 ? '#4e6b39' : '#62803f'; c.beginPath(); c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, 1.6, 0, TAU); c.fill(); }
  for (let i = 0; i < 12; i++) { const a = Math.PI + r() * Math.PI, d = Math.sqrt(r()) * 10; c.fillStyle = r() < 0.6 ? '#f2a6c4' : '#e27aa5'; c.beginPath(); c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, 1.1, 0, TAU); c.fill(); }
}

/** A waratah: a tall stem, a few toothed leaves, and the big red flower head with its ring of bracts. */
function waratah(c: Ctx, r: () => number, h: number, rad: number) {
  const top = -h;
  c.strokeStyle = '#3f5f2f'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-2, -h * 0.5, 0, top); c.stroke();
  for (let i = 0; i < 4; i++) { const ly = -h * (0.2 + i * 0.17), side = i % 2 ? 1 : -1; c.save(); c.translate(side * 5, ly); c.rotate(side * 0.6); c.fillStyle = '#4d6e3a'; c.beginPath(); c.ellipse(0, 0, 6, 1.8, 0, 0, TAU); c.fill(); c.restore(); }
  c.fillStyle = '#b0182b';
  for (let k = 0; k < 7; k++) { const a = Math.PI * 0.05 + (k / 6) * Math.PI * 0.9; c.save(); c.translate(Math.cos(a) * 6, top + 3 + Math.sin(a) * 2); c.rotate(a); c.beginPath(); c.ellipse(0, 0, 5, 2, 0, 0, TAU); c.fill(); c.restore(); }
  c.fillStyle = '#d42536'; c.beginPath(); c.ellipse(0, top - 3, rad * 0.7, rad * 0.8, 0, 0, TAU); c.fill();
  c.fillStyle = 'rgba(120,10,25,0.6)'; for (let k = 0; k < 14; k++) { const a = r() * TAU, d = r() * rad * 0.55; c.beginPath(); c.arc(Math.cos(a) * d, top - 3 + Math.sin(a) * d, 0.8, 0, TAU); c.fill(); }
}

/** A tuft of native grass, kangaroo grass or poa: dozens of fine blades fanning up and arching over, paler at the
 *  tips, with a few taller stalks carrying rusty seed heads. */
function nativeGrass(c: Ctx, r: () => number, s: number) {
  for (let i = 0; i < 34; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 2, len = (10 + r() * 13) * s, side = Math.cos(a);
    const ex = side * len * 0.9, ey = -len * (0.55 + 0.35 * (1 - Math.abs(side))), cx = side * len * 0.25, cy = -len * 1.05;
    c.strokeStyle = r() < 0.5 ? '#7e8f4b' : r() < 0.6 ? '#93a057' : '#6c8040'; c.lineWidth = 0.8 * s;
    c.beginPath(); c.moveTo((r() - 0.5) * 3 * s, 0); c.quadraticCurveTo(cx, cy, ex, ey); c.stroke();
    c.strokeStyle = 'rgba(214,198,135,0.75)'; c.lineWidth = 0.7 * s; // dry, pale tips
    c.beginPath(); c.moveTo(cx + (ex - cx) * 0.55, cy + (ey - cy) * 0.55); c.quadraticCurveTo(cx + (ex - cx) * 0.8, cy + (ey - cy) * 0.75, ex, ey); c.stroke();
  }
  for (let i = 0; i < 4; i++) { // seed stalks
    const x = (r() - 0.5) * 8 * s, h = (22 + r() * 10) * s, lean = (r() - 0.5) * 6 * s;
    c.strokeStyle = '#a8995e'; c.lineWidth = 0.6 * s; c.beginPath(); c.moveTo(x, 0); c.quadraticCurveTo(x + lean * 0.3, -h * 0.6, x + lean, -h); c.stroke();
    c.fillStyle = '#8d5a3a'; for (let k = 0; k < 4; k++) { c.beginPath(); c.ellipse(x + lean + (k % 2 ? 1.2 : -1.2) * s, -h + k * 1.6 * s, 0.7 * s, 1.5 * s, (k % 2 ? 0.5 : -0.5), 0, TAU); c.fill(); }
  }
}

/** A clump of rushes and cumbungi: tall, nearly straight blades and stems, a few carrying the brown velvety heads. */
function reeds(c: Ctx, r: () => number, s: number) {
  for (let i = 0; i < 18; i++) {
    const x = (r() - 0.5) * 12 * s, h = (16 + r() * 20) * s, lean = (r() - 0.5) * 7 * s;
    c.strokeStyle = r() < 0.4 ? '#4e6b2f' : r() < 0.7 ? '#62803a' : '#7a8f48'; c.lineWidth = (0.9 + r() * 0.6) * s; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x, 0); c.quadraticCurveTo(x + lean * 0.2, -h * 0.6, x + lean, -h); c.stroke();
  }
  for (let i = 0; i < 2 + Math.floor(r() * 3); i++) {
    const x = (r() - 0.5) * 9 * s, h = (26 + r() * 12) * s, lean = (r() - 0.5) * 4 * s;
    c.strokeStyle = '#5d7438'; c.lineWidth = 0.9 * s; c.beginPath(); c.moveTo(x, 0); c.lineTo(x + lean, -h); c.stroke();
    c.fillStyle = '#6b4a2b'; c.beginPath(); c.ellipse(x + lean * 0.85, -h * 0.82, 1.5 * s, 4.2 * s, lean * 0.02, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,230,200,0.25)'; c.beginPath(); c.ellipse(x + lean * 0.85 - 0.5 * s, -h * 0.84, 0.5 * s, 3.2 * s, 0, 0, TAU); c.fill();
  }
}

/** A fallen log, `L` long: weathered grey with bark peeling off in places, one end snapped and splintered, the other
 *  showing its growth rings round a rotted-out heart, moss on top and the stub of a branch. */
function fallenLog(c: Ctx, r: () => number, Lg: number, a = 0) {
  // how it looks from here: lying across the view it's long and level; pointing towards us it's shorter and slopes down
  // to its near end, where the cut face turns to us
  const t = Math.abs(a), sn = Math.sin(t), L = Lg * Math.hypot(Math.cos(t), 0.38 * sn), tilt = Math.atan2(0.38 * sn, Math.cos(t)) + (r() - 0.5) * 0.12;
  const th = Lg * (0.075 + r() * 0.05), capW = th * (0.38 + 0.55 * sn);
  c.save(); if (a < 0) c.scale(-1, 1); // pointing the other way, near end on the left
  c.fillStyle = 'rgba(35,40,20,0.3)'; c.beginPath(); c.ellipse(0, 1, L * 0.56, th * 0.75, tilt, 0, TAU); c.fill();
  c.save(); c.rotate(tilt);
  const x0 = -L / 2, x1 = L / 2, y = -th;
  // a branch stub, then the body
  c.strokeStyle = '#8f877a'; c.lineWidth = th * 0.55; c.lineCap = 'round'; const bx = x0 + L * (0.3 + r() * 0.3); c.beginPath(); c.moveTo(bx, y - th * 0.6); c.lineTo(bx + th * 0.9, y - th * 1.9); c.stroke();
  c.fillStyle = '#d8cfbe'; c.beginPath(); c.ellipse(bx + th * 0.9, y - th * 1.9, th * 0.24, th * 0.14, -0.6, 0, TAU); c.fill();
  const g = c.createLinearGradient(0, y - th, 0, y + th); g.addColorStop(0, '#c2bbad'); g.addColorStop(0.5, '#9c9486'); g.addColorStop(1, '#6e665b');
  c.fillStyle = g; c.beginPath(); c.moveTo(x0, y - th); c.lineTo(x1, y - th * 0.92); c.lineTo(x1, y + th * 0.92); c.lineTo(x0, y + th); c.closePath(); c.fill();
  c.save(); c.clip();
  c.strokeStyle = 'rgba(70,62,52,0.45)'; c.lineWidth = 0.7; // long cracks in the weathered wood
  for (let i = 0; i < 6; i++) { const yy = y + (r() - 0.5) * th * 1.6, xa = x0 + r() * L * 0.5; c.beginPath(); c.moveTo(xa, yy); c.lineTo(xa + L * (0.2 + r() * 0.4), yy + (r() - 0.5) * 2); c.stroke(); }
  c.fillStyle = 'rgba(120,88,58,0.55)'; // bark still clinging in patches
  for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(x0 + r() * L, y + th * (0.2 + r() * 0.5), L * (0.06 + r() * 0.08), th * 0.45, 0, 0, TAU); c.fill(); }
  c.fillStyle = 'rgba(105,135,60,0.6)'; // moss along the top
  for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(x0 + r() * L, y - th * 0.85, L * (0.04 + r() * 0.05), th * 0.25, 0, 0, TAU); c.fill(); }
  c.restore();
  // the snapped end, splintered
  c.fillStyle = '#ddd3c1'; c.beginPath(); c.moveTo(x0 + 1, y - th);
  for (let i = 0; i <= 6; i++) c.lineTo(x0 - (i % 2 ? 3 + r() * 3 : r()), y - th + (i / 6) * th * 2);
  c.lineTo(x0 + 1, y + th); c.closePath(); c.fill();
  // the other end: rings round a hollow heart
  c.fillStyle = '#cbbd9f'; c.beginPath(); c.ellipse(x1, y, capW, th * 0.95, 0, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(120,96,64,0.6)'; c.lineWidth = 0.5; for (const k of [0.75, 0.5]) { c.beginPath(); c.ellipse(x1, y, capW * k, th * 0.95 * k, 0, 0, TAU); c.stroke(); }
  c.fillStyle = '#2a2018'; c.beginPath(); c.ellipse(x1 + 0.3, y + th * 0.05, capW * 0.36, th * 0.35, 0, 0, TAU); c.fill();
  c.restore(); c.restore();
}

/** Spiky lomandra tussock. */
function tussock(c: Ctx, r: () => number, x: number, y: number, s: number) {
  for (let i = 0; i < 11; i++) {
    const a = -Math.PI / 2 + (i - 5) * 0.2 + (r() - 0.5) * 0.15, len = (8 + r() * 8) * s;
    c.strokeStyle = r() < 0.5 ? '#557531' : '#6e8c3e'; c.lineWidth = 1.1 * s;
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.7, x + Math.cos(a) * len * 1.1, y + Math.sin(a) * len * 0.85); c.stroke();
  }
}
