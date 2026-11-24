// Drawing the clearing's other animals (see critters.ts). Each is drawn in "units" around its feet at (0, 0),
// facing right, then placed, scaled and flipped.
import { critterScale, type Critter } from './critters';
import type { World } from './sim';
import { hollowPath, burrowMouth } from './nature';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const ell = (c: Ctx, x: number, y: number, rx: number, ry: number, rot = 0) => { c.beginPath(); c.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU); c.fill(); };
const line = (c: Ctx, pts: [number, number][], w: number, col: string) => { c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke(); };

// ---------- powerful owl ----------
const OWL = { back: '#5a493b', wing: '#4c3d31', bar: '#cdbfa6', breast: '#ece3d0', chevron: '#5d4a3a', face: '#6b5a4a', eye: '#f6c935', foot: '#d6bd76', bill: '#8a8377' };
/** Its head, face-on: the owl turns to look about (look −1 … 1). */
function owlHead(c: Ctx, look: number, blink: boolean, y = -52) {
  c.fillStyle = OWL.back; ell(c, 0, y, 14, 13);
  c.fillStyle = OWL.face; ell(c, look * 3, y + 2, 11, 9.5);
  c.strokeStyle = OWL.bar; c.lineWidth = 1.6; c.lineCap = 'round';
  c.beginPath(); c.moveTo(look * 4 - 10, y - 5); c.quadraticCurveTo(look * 4 - 4, y - 8, look * 4, y - 3); c.quadraticCurveTo(look * 4 + 4, y - 8, look * 4 + 10, y - 5); c.stroke();
  for (const s of [-1, 1]) {
    const ex = look * 4 + s * 5.5;
    if (blink) { line(c, [[ex - 3.5, y], [ex + 3.5, y]], 1.2, '#2a2118'); continue; }
    c.fillStyle = OWL.eye; ell(c, ex, y, 4, 4); c.fillStyle = '#111'; ell(c, ex + look * 0.8, y, 2.3, 2.3); c.fillStyle = 'rgba(255,255,255,0.8)'; ell(c, ex - 1.2, y - 1.3, 0.8, 0.8);
  }
  c.fillStyle = OWL.bill; c.beginPath(); c.moveTo(look * 4 - 1.8, y + 3); c.lineTo(look * 4 + 1.8, y + 3); c.lineTo(look * 4, y + 7.5); c.closePath(); c.fill();
}
function owlPerched(c: Ctx, w: World, o: Critter) {
  const eating = o.st === 'eat', bob = eating ? Math.max(0, Math.sin(o.t * 5)) * 6 : 0, hooting = w.t - o.hoot < 1.2;
  c.fillStyle = OWL.wing; ell(c, 0, -2, 8, 5); // tail
  c.fillStyle = OWL.back; ell(c, 0, -26, 15, 24);
  c.fillStyle = OWL.breast; ell(c, 0, -24, 11, 20);
  c.strokeStyle = OWL.chevron; c.lineWidth = 1.1;
  for (let r = 0; r < 5; r++) for (let i = -1; i <= 1; i++) { const x = i * 5.5, y = -38 + r * 6.5; c.beginPath(); c.moveTo(x - 2.2, y - 1.5); c.lineTo(x, y + 0.8); c.lineTo(x + 2.2, y - 1.5); c.stroke(); }
  for (const s of [-1, 1]) { // folded wings, barred
    c.fillStyle = OWL.wing; ell(c, s * 12.5, -27, 6, 21, s * 0.08);
    c.strokeStyle = OWL.bar; c.lineWidth = 0.9; for (let i = 0; i < 6; i++) { const y = -42 + i * 6; c.beginPath(); c.moveTo(s * 9.5, y); c.lineTo(s * 15.5, y + 1); c.stroke(); }
  }
  if (hooting) { c.fillStyle = OWL.breast; ell(c, 0, -38, 6, 4.5); }
  if (o.prey) { c.save(); c.translate(-2, 2); c.rotate(1.3); antechinusBody(c, 0, true); c.restore(); }
  c.fillStyle = OWL.foot; for (const s of [-1, 1]) ell(c, s * 5, -1, 3.2, 2);
  line(c, [[-7.5, 0], [-6.5, 2.5]], 1, '#2a2118'); line(c, [[7.5, 0], [6.5, 2.5]], 1, '#2a2118');
  owlHead(c, o.look, Math.sin(w.t * 0.9 + o.ph) > 0.985, -52 + bob);
}
function owlFlying(c: Ctx, o: Critter) {
  const f = Math.sin(o.ph * 1.6), grab = o.next === 'grab' && o.t / o.dur > 0.6;
  const wing = (far: boolean) => {
    const fe = (far ? 0.9 : 1) * Math.sign(f || 1) * Math.max(0.2, Math.abs(f)), ox = far ? 3 : 0, oy = far ? -2 : 0;
    c.fillStyle = far ? '#3f3329' : OWL.wing;
    c.beginPath(); c.moveTo(6 + ox, -14 + oy); c.quadraticCurveTo(12 + ox, -14 - 26 * fe + oy, -2 + ox, -14 - 38 * fe + oy); c.quadraticCurveTo(-18 + ox, -14 - 30 * fe + oy, -16 + ox, -14 + oy); c.closePath(); c.fill();
    if (!far) { c.strokeStyle = OWL.bar; c.lineWidth = 1; for (let i = 1; i < 5; i++) { const t = i / 5; c.beginPath(); c.moveTo(4 - 18 * t, -14 - 30 * fe * t); c.lineTo(-2 - 16 * t, -14 - 22 * fe * t); c.stroke(); } }
  };
  wing(true);
  c.fillStyle = OWL.wing; c.beginPath(); c.moveTo(-14, -12); c.lineTo(-30, -14); c.lineTo(-29, -7); c.closePath(); c.fill(); // tail
  c.fillStyle = OWL.back; ell(c, 0, -11, 20, 9);
  c.fillStyle = OWL.breast; ell(c, 2, -7, 15, 5);
  if (grab || o.prey) { // talons forward
    c.strokeStyle = OWL.foot; c.lineWidth = 2.5; c.beginPath(); c.moveTo(4, -6); c.lineTo(14, 3); c.stroke();
    line(c, [[13, 3], [17, 5]], 1.2, '#2a2118'); line(c, [[13, 3], [15, 7]], 1.2, '#2a2118');
    if (o.prey) { c.save(); c.translate(12, 7); c.rotate(0.3); antechinusBody(c, 0, true); c.restore(); }
  }
  c.fillStyle = OWL.back; ell(c, 17, -15, 10, 9.5);
  c.fillStyle = OWL.face; ell(c, 21, -14, 5.5, 7);
  c.fillStyle = OWL.eye; ell(c, 23, -16, 2.6, 2.6); c.fillStyle = '#111'; ell(c, 23.6, -16, 1.5, 1.5);
  c.fillStyle = OWL.bill; c.beginPath(); c.moveTo(25.5, -13); c.lineTo(28, -11); c.lineTo(25, -10); c.closePath(); c.fill();
  wing(false);
}

// ---------- antechinus ----------
function antechinusBody(c: Ctx, ph: number, limp = false) {
  const run = !limp && Math.sin(ph) > 0, stretch = run ? 1.1 : 1;
  line(c, [[-7, -3], [-12, -1.5 + Math.sin(ph * 0.5)], [-18, -2]], 0.9, '#6a5037');
  c.fillStyle = '#86684a'; ell(c, 0, -4, 8 * stretch, 4.2 / stretch);
  c.fillStyle = '#b39878'; ell(c, 0.5, -2.5, 6, 1.8);
  c.fillStyle = '#86684a'; c.beginPath(); c.moveTo(5, -7.5); c.quadraticCurveTo(10, -7.2, 12.5, -4.2); c.quadraticCurveTo(9, -2.2, 5, -2.5); c.closePath(); c.fill();
  c.fillStyle = '#9c7b58'; ell(c, 6.5, -7.8, 1.7, 1.7);
  c.fillStyle = '#111'; ell(c, 9.3, -5.8, 0.9, 0.9); c.fillStyle = '#e8c9b0'; ell(c, 12.4, -4.2, 0.7, 0.6);
  if (!limp) { const s = Math.sin(ph) * 1.5; line(c, [[-4, -1.5], [-4 - s, 0]], 0.9, '#5d4632'); line(c, [[4, -1.5], [4 + s, 0]], 0.9, '#5d4632'); }
}

// ---------- skink and water dragon ----------
function skink(c: Ctx, m: Critter) {
  const wig = m.st === 'dash' ? Math.sin(m.ph) * 1.6 : 0;
  line(c, [[-5, -1.4], [-10, -1 + wig], [-16, -0.6 - wig * 0.5], [-21, -0.4]], 1.4, '#7d6038');
  c.fillStyle = '#8d6c3f'; ell(c, 0, -1.6, 6.5, 1.8);
  line(c, [[-5, -1.5], [5, -1.6]], 0.6, '#3b2a1a');
  c.fillStyle = '#7d6038'; ell(c, 6.8, -1.8, 2.8, 1.5);
  c.fillStyle = '#111'; ell(c, 7.8, -2.2, 0.45, 0.45);
  const s = m.st === 'dash' ? Math.sin(m.ph) * 1.4 : 0;
  for (const [x, d] of [[3.5, 1], [-3.5, -1]] as const) { line(c, [[x, -1], [x + 1.6 + s * d, 0.6]], 0.6, '#5d4630'); line(c, [[x, -1], [x - 1.6 - s * d, 0.6]], 0.6, '#5d4630'); }
}
function dragon(c: Ctx, d: Critter) {
  const run = d.st === 'run', bob = d.st === 'bask' && Math.sin(d.ph * 0.5) > 0.92 ? Math.sin(d.ph * 30) * 1.5 : 0, s = run ? Math.sin(d.ph * 28) : 0;
  c.save(); if (run) { c.translate(0, -2); c.rotate(-0.35); }
  const tail: [number, number][] = [[-14, -5], [-28, -3], [-44, -1.5], [-56, -1]];
  line(c, tail, 3.4, '#6f7257'); c.strokeStyle = '#3c3e2e'; c.lineWidth = 3.6; for (const t of [0.35, 0.55, 0.75]) { const i = Math.floor(t * 3), u = t * 3 - i, a = tail[i]!, b = tail[i + 1]!; const x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u; c.beginPath(); c.moveTo(x, y - 1); c.lineTo(x - 1.5, y + 1); c.stroke(); }
  c.fillStyle = '#7b7f60'; ell(c, 0, -6, 16, 5.5);
  c.fillStyle = '#c9b68a'; ell(c, 1, -3.5, 12, 2);
  c.fillStyle = '#4e5240'; for (let i = 0; i < 8; i++) { const x = 12 - i * 3.2; c.beginPath(); c.moveTo(x, -10.5); c.lineTo(x - 1.2, -13.5 + (i % 2)); c.lineTo(x - 2.4, -10.5); c.closePath(); c.fill(); }
  c.fillStyle = '#7b7f60'; c.beginPath(); c.moveTo(13, -10 + bob); c.quadraticCurveTo(24, -11 + bob, 27, -6 + bob); c.quadraticCurveTo(22, -3, 13, -3); c.closePath(); c.fill();
  line(c, [[18, -8 + bob], [24, -7 + bob]], 1.2, '#26281e');
  c.fillStyle = '#f0e2b0'; ell(c, 20.5, -8 + bob, 1.2, 1.2); c.fillStyle = '#111'; ell(c, 20.8, -8 + bob, 0.6, 0.6);
  const leg = (x: number, ph: number) => line(c, [[x, -4], [x + 3 * ph, -1.5], [x + 1 + 4 * ph, 0.6]], 1.6, '#5f6249');
  leg(-9, run ? s : 0.3); leg(-6, run ? -s : -0.3);
  if (!run) { leg(8, -0.3); leg(10, 0.3); }
  c.restore();
}

// ---------- red-bellied black snake ----------
function snake(c: Ctx, w: World, s: Critter) {
  const T = s.trail; if (T.length < 2) return;
  const k = critterScale(w, s), wid = (i: number) => (1 - i / T.length) * 3.6 * k * 2 + 0.8;
  const rear = s.st === 'rear' ? Math.min(1, s.t * 3) * (s.t < s.dur - 0.3 ? 1 : Math.max(0, (s.dur - s.t) / 0.3)) : 0;
  const pt = (i: number): [number, number] => { const [x, y] = T[i]!, lift = rear * Math.max(0, 1 - i / 10) * 9 * k; return [x, y - lift - 1.5 * k]; };
  for (let pass = 0; pass < 3; pass++) {
    for (let i = T.length - 1; i > 0; i--) {
      const [x0, y0] = pt(i), [x1, y1] = pt(i - 1), wv = wid(i);
      c.strokeStyle = pass === 0 ? '#c23a2e' : pass === 1 ? '#141414' : 'rgba(120,120,130,0.55)';
      c.lineWidth = pass === 2 ? wv * 0.25 : wv; c.lineCap = 'round';
      const off = pass === 0 ? wv * 0.3 : pass === 2 ? -wv * 0.25 : 0;
      c.beginPath(); c.moveTo(x0, y0 + off); c.lineTo(x1, y1 + off); c.stroke();
    }
  }
  const [hx, hy] = pt(0), [nx, ny] = pt(Math.min(3, T.length - 1)), a = Math.atan2(hy - ny, hx - nx);
  c.save(); c.translate(hx, hy); c.rotate(a);
  c.fillStyle = '#141414'; ell(c, 1.2 * k, 0, 3.4 * k + 0.6, 2.4 * k + 0.5);
  if (Math.sin(w.t * 9 + s.ph) > 0.5) line(c, [[4 * k, 0], [8 * k, 0], [10 * k, -1 * k]], 0.6, '#d2343a');
  c.restore();
}

// ---------- kangaroo or wallaby ----------
function roo(c: Ctx, r: Critter) {
  const wal = r.v === 1, body = wal ? '#56483c' : '#a08f7c', belly = wal ? '#ad7650' : '#ddd0bd', dark = wal ? '#2f261f' : '#6e6052';
  // lean: how far the body tips forward from upright, about the hip. Sitting up alert, standing, mid-hop, grazing.
  let lean = 0.55, lift = 0, air = 0, headDrop = 0;
  if (r.st === 'hop') {
    const HOP = r.v ? 0.42 : 0.5, u = (r.t % HOP) / HOP;
    if (u > 0.15 && u < 0.85) { air = Math.sin((Math.PI * (u - 0.15)) / 0.7); lift = air * 16; lean = 0.95; }
    else lean = 0.75;
  } else if (r.st === 'graze') { lean = 1.25; headDrop = 1; }
  else if (r.st === 'alert') lean = 0.12;
  const rot = (x: number, y: number): [number, number] => [-2 + x * Math.cos(lean) - y * Math.sin(lean), -14 + x * Math.sin(lean) + y * Math.cos(lean)];
  c.save(); c.translate(0, -lift);
  line(c, [[-8, -11], [-24, -6 - air * 8], [-40, -1 - air * 14]], 5, body); // tail: on the ground, or straight out behind mid-hop
  line(c, [[-5 - air * 8, -2 - air * 2], [13 - air * 22, 0 + air * 3]], 3.2, dark); // the long hind foot, kicked back mid-hop
  c.fillStyle = body; ell(c, -3, -12, 11, 9.5); // thigh
  // the body, rotated about the hip, then the neck and head joined to its shoulder
  c.save(); c.translate(-2, -14); c.rotate(lean);
  c.fillStyle = body; ell(c, 1, -17, 10, 18);
  c.fillStyle = belly; ell(c, 5, -15, 4.5, 12);
  c.restore();
  const [sx, sy] = rot(4, -31), hx = headDrop ? 22 : sx + 6, hy = headDrop ? -7 : sy - 7;
  line(c, [[sx, sy], [hx - 2, hy + 1]], 7, body);
  const [ax, ay] = rot(8, -24); line(c, [[ax, ay], [ax + 5, ay + 7 - headDrop * 4]], 1.8, body); // little forearm
  c.fillStyle = body; ell(c, hx, hy, 6.5, 5);
  c.beginPath(); c.moveTo(hx + 3, hy - 2); c.lineTo(hx + 11, hy + 1); c.lineTo(hx + 3, hy + 3.5); c.closePath(); c.fill();
  c.fillStyle = dark; ell(c, hx + 10.5, hy + 1, 1.3, 1.2);
  if (wal) { c.fillStyle = '#d8c9b0'; ell(c, hx + 3, hy + 2.5, 4, 0.9, 0.2); }
  c.fillStyle = body; for (const dx of [-2, 1.5]) ell(c, hx + dx, hy - 7, 1.8, r.st === 'alert' ? 6.5 : 5.5, -0.25);
  c.fillStyle = '#111'; ell(c, hx + 4, hy - 1.5, 0.9, 0.9);
  c.restore();
}

// ---------- wombat ----------
function wombat(c: Ctx, b: Critter) {
  const walk = b.st === 'walk' || b.st === 'home' || b.st === 'enter', sway = walk ? Math.sin(b.ph * 6) : 0, graze = b.st === 'graze', scratch = b.st === 'scratch';
  const fur = '#6e6150', dark = '#4f4538';
  c.save();
  if (scratch) { c.translate(-6, 0); c.rotate(-0.3); }
  const leg = (x: number, ph: number) => { const up = Math.max(0, ph) * -2; c.fillStyle = dark; c.fillRect(x - 3.5, -9 + up, 7, 7.5); ell(c, x, -1.5 + up, 3.5, 1.8); };
  leg(-20, sway); leg(14, -sway);
  c.fillStyle = fur; ell(c, 0, -17, 30, 16, sway * 0.03);
  c.fillStyle = 'rgba(255,240,220,0.12)'; ell(c, -2, -26, 22, 5);
  leg(-14, -sway); leg(20, sway);
  if (scratch) { const s = Math.sin(b.t * 25); c.fillStyle = dark; c.save(); c.translate(-12, -14); c.rotate(-1.2 + s * 0.25); c.fillRect(-3, -12, 6, 10); ell(c, 0, -2, 3, 2); c.restore(); }
  const hy = graze ? -9 + Math.sin(b.t * 9) * 0.8 : -18, hx = graze ? 30 : 28;
  c.fillStyle = fur; ell(c, hx, hy, 12, 10.5, graze ? 0.35 : 0);
  c.fillStyle = '#5e5244'; for (const dx of [-5, 0]) { c.beginPath(); c.moveTo(hx + dx - 3, hy - 8); c.lineTo(hx + dx, hy - 13); c.lineTo(hx + dx + 3, hy - 8); c.closePath(); c.fill(); }
  c.fillStyle = '#1d1915'; ell(c, hx + 10, hy + 2, 4, 3.5);
  c.fillStyle = '#111'; ell(c, hx + 5, hy - 3, 1.2, 1.2);
  c.restore();
}

/** Draw one animal (hidden ones aren't drawn). */
export function drawCritter(c: Ctx, w: World, cr: Critter) {
  if (cr.hidden) return;
  if (cr.k === 'snake') return snake(c, w, cr);
  const k = critterScale(w, cr), x = cr.x, y = cr.y - cr.a;
  c.save();
  if (cr.k === 'owl' && cr.st === 'peek') { // just its face, in the hollow
    const S = w.stag; c.clip(hollowPath(S.hx, S.hy, S.hrx * 0.95, S.hry * 0.95, S.hseed));
    c.translate(S.hx, S.hy + 9 * k); c.scale(k, k); owlHead(c, cr.look, false, -10); c.restore(); return;
  }
  if (cr.k === 'wombat' && ['peek', 'enter', 'home'].includes(cr.st)) { // only the part out of the bank, or in the mouth, shows
    const B = w.burrow, kb = w.U * w.scaleAt(B.y), p = burrowMouth(B.x, B.y, kb); p.rect(B.x + 9 * kb, -1e4, 1e5, 2e4); c.clip(p);
  }
  if (cr.k === 'dragon' && cr.st === 'swim') { c.beginPath(); c.rect(-1e4, -1e4, 2e4, y + 1e4 - 1); c.clip(); }
  c.translate(x, y + (cr.k === 'dragon' && cr.st === 'swim' ? 5 * k : 0));
  c.scale(k * cr.face, k);
  switch (cr.k) {
    case 'owl': cr.st === 'fly' ? owlFlying(c, cr) : owlPerched(c, w, cr); break;
    case 'antechinus': antechinusBody(c, cr.ph); break;
    case 'skink': skink(c, cr); break;
    case 'dragon': dragon(c, cr); break;
    case 'roo': roo(c, cr); break;
    case 'wombat': wombat(c, cr); break;
  }
  c.restore();
  if (cr.k === 'dragon' && cr.st === 'swim') { c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 1; c.beginPath(); c.ellipse(x + 8 * k * cr.face, y, 9 * k, 2 * k, 0, 0, TAU); c.stroke(); }
}

/** The owl's eyes catch the light at night: drawn over the darkness. */
export function owlEyeShine(c: Ctx, w: World, o: Critter) {
  if (o.hidden || o.st === 'fly' || !w.night) return;
  const k = critterScale(w, o), S = w.stag, peek = o.st === 'peek';
  const cx = peek ? S.hx : o.x, cy = peek ? S.hy + 9 * k - 10 * k : o.y - o.a - 52 * k;
  for (const s of [-1, 1]) {
    const ex = cx + (o.look * 4 + s * 5.5) * k * (peek ? 1 : o.face), g = c.createRadialGradient(ex, cy, 0, ex, cy, 5 * k + 2);
    g.addColorStop(0, 'rgba(255,214,80,0.55)'); g.addColorStop(1, 'rgba(255,214,80,0)');
    c.fillStyle = g; c.beginPath(); c.arc(ex, cy, 5 * k + 2, 0, TAU); c.fill();
  }
}
