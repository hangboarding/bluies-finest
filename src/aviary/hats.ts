// Hats for the crew's birds (an admin turns them on for everyone): each bird wears one, in its climber's
// leg-band colour. Drawn in the hat's own frame: the brim's middle at (0, 0), up is -y, the bill's way is +x,
// one unit `u` being the bird's head radius.
import { shade } from './rig';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

export const HATS = ['tophat', 'bowler', 'flatcap', 'beanie', 'cap', 'bucket', 'party', 'crown', 'fez', 'akubra', 'cork'] as const;
export type HatKind = typeof HATS[number];

/** The hat a climber's `n`th bird wears this week: each climber's hats are shuffled afresh every week, so their
 *  birds all wear different ones (until there are more birds than hats), and a bird keeps its hat all week. */
export function hatOf(uid: string, n: number, week = 0): HatKind {
  let h = 2166136261;
  for (const ch of `${uid}|${week}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const order: HatKind[] = [...HATS];
  for (let i = order.length - 1, s = h >>> 0; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1); [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order[((n % order.length) + order.length) % order.length]!;
}

/** A rounded rectangle path (CanvasRenderingContext2D.roundRect isn't on older iPhones). */
function rrect(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
/** How light a #rrggbb colour is, 0..1. */
function lum(hex: string) {
  const n = parseInt(hex.slice(1), 16); if (hex.length !== 7 || Number.isNaN(n)) return 0.5;
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

/** Draws hat `k` in colour `col` (`sil`: all one flat colour, for the button's silhouette). (gx, gy) is which way
 *  is down in the hat's frame, for the things that dangle (the fez's tassel, the corks); `t` swings them. */
export function drawHat(c: Ctx, k: HatKind, u: number, col: string, sil: boolean, gx = 0, gy = 1, t = 0) {
  const dk = sil ? col : shade(col, 0.62), lt = sil ? col : shade(col, 1.25), edge = shade(col, 0.5);
  const pop = lum(col) > 0.62 ? shade(col, 0.55) : '#ffffff'; // spots and gems that show on any colour
  const fill = (s: string) => { c.fillStyle = s; c.fill(); };
  const outline = () => { if (!sil) { c.strokeStyle = edge; c.lineWidth = u * 0.05; c.stroke(); } };
  /** Fills a strip across whatever path is current, clipped to it (hat bands, cuffs). */
  const strip = (y0: number, y1: number, s: string) => { if (sil) return; c.save(); c.clip(); c.fillStyle = s; c.fillRect(-2 * u, y0 * u, 4 * u, (y1 - y0) * u); c.restore(); };
  /** Something on a string hanging from (x, y): swings about the way down. */
  const dangle = (x: number, y: number, len: number, ph: number) => {
    const a = Math.atan2(gy, gx) + 0.32 * Math.sin(t * 2.4 + ph);
    return [x * u + Math.cos(a) * len * u, y * u + Math.sin(a) * len * u, a] as const;
  };
  c.lineJoin = 'round'; c.lineCap = 'round';

  switch (k) {
    case 'tophat': {
      c.beginPath(); c.moveTo(-0.92 * u, 0.02 * u); c.quadraticCurveTo(-0.98 * u, -0.16 * u, -0.78 * u, -0.1 * u); c.lineTo(0.78 * u, -0.1 * u);
      c.quadraticCurveTo(0.98 * u, -0.16 * u, 0.92 * u, 0.02 * u); c.quadraticCurveTo(0, 0.16 * u, -0.92 * u, 0.02 * u); fill(col); outline();
      c.beginPath(); c.moveTo(-0.5 * u, -0.06 * u); c.lineTo(-0.58 * u, -1.32 * u); c.quadraticCurveTo(0, -1.42 * u, 0.58 * u, -1.32 * u); c.lineTo(0.5 * u, -0.06 * u); c.closePath();
      fill(col); strip(-0.42, -0.12, dk); outline();
      if (!sil) { c.globalAlpha = 0.3; c.fillStyle = lt; c.fillRect(0.18 * u, -1.28 * u, 0.12 * u, 0.82 * u); c.globalAlpha = 1; }
      break;
    }
    case 'bowler': {
      c.beginPath(); c.ellipse(0, -0.06 * u, 0.62 * u, 0.82 * u, 0, Math.PI, TAU); c.closePath(); fill(col); strip(-0.32, -0.08, dk); outline();
      c.beginPath(); c.ellipse(0, -0.04 * u, 0.9 * u, 0.13 * u, 0, 0, TAU); fill(col); outline();
      if (!sil) { c.beginPath(); c.ellipse(-0.18 * u, -0.6 * u, 0.16 * u, 0.1 * u, -0.5, 0, TAU); c.globalAlpha = 0.35; fill(lt); c.globalAlpha = 1; }
      break;
    }
    case 'flatcap': {
      c.beginPath(); c.moveTo(-0.72 * u, 0.04 * u);
      c.bezierCurveTo(-0.8 * u, -0.46 * u, -0.2 * u, -0.7 * u, 0.36 * u, -0.5 * u);
      c.quadraticCurveTo(0.82 * u, -0.32 * u, 1.02 * u, -0.02 * u);
      c.quadraticCurveTo(0.72 * u, 0.1 * u, 0.34 * u, 0.04 * u); c.closePath(); fill(col); outline();
      if (!sil) {
        c.strokeStyle = dk; c.lineWidth = u * 0.06; c.beginPath(); c.moveTo(0.3 * u, -0.48 * u); c.quadraticCurveTo(0.3 * u, -0.2 * u, 0.4 * u, 0.04 * u); c.stroke();
        c.lineWidth = u * 0.03; c.globalAlpha = 0.5; // tweed
        for (let i = 0; i < 5; i++) { const x = (-0.5 + i * 0.2) * u; c.beginPath(); c.moveTo(x, -0.08 * u); c.lineTo(x + 0.12 * u, -0.38 * u); c.stroke(); }
        c.globalAlpha = 1;
      }
      break;
    }
    case 'beanie': {
      c.beginPath(); c.moveTo(-0.72 * u, 0.14 * u); c.bezierCurveTo(-0.78 * u, -0.8 * u, 0.78 * u, -0.8 * u, 0.72 * u, 0.14 * u); c.closePath(); fill(col);
      if (!sil) { c.save(); c.clip(); c.strokeStyle = dk; c.lineWidth = u * 0.05; c.globalAlpha = 0.45; for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * 0.2 * u, 0.2 * u); c.quadraticCurveTo(i * 0.16 * u, -0.3 * u, i * 0.05 * u, -0.7 * u); c.stroke(); } c.restore(); }
      outline();
      rrect(c, -0.76 * u, -0.1 * u, 1.52 * u, 0.28 * u, 0.1 * u); fill(lt);
      if (!sil) { c.strokeStyle = col; c.lineWidth = u * 0.05; for (let i = 0; i < 8; i++) { const x = (-0.66 + i * 0.19) * u; c.beginPath(); c.moveTo(x, -0.06 * u); c.lineTo(x, 0.14 * u); c.stroke(); } }
      outline();
      for (const [x, y, r] of [[0, -0.74, 0.26], [-0.14, -0.84, 0.12], [0.15, -0.86, 0.11], [0.2, -0.66, 0.1], [-0.18, -0.64, 0.1]] as const) { c.beginPath(); c.arc(x * u, y * u, r * u, 0, TAU); fill(lt); }
      break;
    }
    case 'cap': {
      c.beginPath(); c.moveTo(-0.64 * u, 0.04 * u); c.bezierCurveTo(-0.68 * u, -0.74 * u, 0.62 * u, -0.8 * u, 0.66 * u, 0.04 * u); c.closePath(); fill(col); outline();
      c.beginPath(); c.moveTo(0.36 * u, -0.06 * u); c.quadraticCurveTo(1.0 * u, -0.14 * u, 1.24 * u, 0.06 * u); c.quadraticCurveTo(0.9 * u, 0.16 * u, 0.36 * u, 0.08 * u); c.closePath(); fill(dk); outline();
      if (!sil) {
        c.strokeStyle = dk; c.lineWidth = u * 0.05; c.beginPath(); c.moveTo(0, -0.62 * u); c.quadraticCurveTo(0.14 * u, -0.3 * u, 0.12 * u, 0.04 * u); c.stroke();
        c.beginPath(); c.arc(0, -0.63 * u, 0.08 * u, 0, TAU); fill(dk);
      }
      break;
    }
    case 'bucket': {
      c.beginPath(); c.moveTo(-0.5 * u, -0.06 * u); c.lineTo(-0.42 * u, -0.7 * u); c.quadraticCurveTo(0, -0.84 * u, 0.42 * u, -0.7 * u); c.lineTo(0.5 * u, -0.06 * u); c.closePath(); fill(col); outline();
      c.beginPath(); c.moveTo(-0.56 * u, -0.12 * u); c.quadraticCurveTo(-0.92 * u, -0.02 * u, -1.0 * u, 0.18 * u); c.quadraticCurveTo(0, 0.3 * u, 1.0 * u, 0.18 * u); c.quadraticCurveTo(0.92 * u, -0.02 * u, 0.56 * u, -0.12 * u); c.closePath(); fill(dk); outline();
      if (!sil) { // stitching
        c.strokeStyle = lt; c.lineWidth = u * 0.035; c.setLineDash([u * 0.07, u * 0.06]);
        c.beginPath(); c.moveTo(-0.84 * u, 0.1 * u); c.quadraticCurveTo(0, 0.2 * u, 0.84 * u, 0.1 * u); c.stroke();
        c.beginPath(); c.moveTo(-0.46 * u, -0.28 * u); c.quadraticCurveTo(0, -0.36 * u, 0.46 * u, -0.28 * u); c.stroke();
        c.setLineDash([]);
      }
      break;
    }
    case 'party': {
      c.beginPath(); c.moveTo(-0.52 * u, 0.02 * u); c.lineTo(0.1 * u, -1.56 * u); c.lineTo(0.54 * u, 0.02 * u); c.quadraticCurveTo(0, 0.14 * u, -0.52 * u, 0.02 * u); c.closePath(); fill(col);
      if (!sil) { c.save(); c.clip(); c.fillStyle = pop; for (const [x, y] of [[-0.22, -0.18], [0.24, -0.3], [0, -0.62], [-0.08, -0.98], [0.2, -0.86], [0.08, -1.26], [-0.34, -0.5]] as const) { c.beginPath(); c.arc(x * u, y * u, 0.09 * u, 0, TAU); c.fill(); } c.restore(); }
      outline();
      for (const [x, y, r] of [[0.1, -1.6, 0.16], [0.0, -1.66, 0.09], [0.2, -1.66, 0.09], [0.1, -1.76, 0.08]] as const) { c.beginPath(); c.arc(x * u, y * u, r * u, 0, TAU); fill(sil ? col : pop); }
      break;
    }
    case 'crown': {
      c.beginPath(); c.moveTo(-0.6 * u, 0.04 * u); c.lineTo(-0.68 * u, -0.62 * u); c.lineTo(-0.34 * u, -0.32 * u); c.lineTo(0, -0.76 * u);
      c.lineTo(0.34 * u, -0.32 * u); c.lineTo(0.68 * u, -0.62 * u); c.lineTo(0.6 * u, 0.04 * u); c.closePath(); fill(col); strip(-0.2, 0.04, dk); outline();
      for (const [x, y] of [[-0.68, -0.64], [0, -0.8], [0.68, -0.64]] as const) { c.beginPath(); c.arc(x * u, y * u, 0.08 * u, 0, TAU); fill(lt); }
      if (!sil) for (const x of [-0.34, 0, 0.34]) { c.beginPath(); c.arc(x * u, -0.08 * u, 0.075 * u, 0, TAU); fill(pop); }
      break;
    }
    case 'fez': {
      c.beginPath(); c.moveTo(-0.48 * u, 0.02 * u); c.lineTo(-0.36 * u, -0.84 * u); c.quadraticCurveTo(0, -0.9 * u, 0.36 * u, -0.84 * u); c.lineTo(0.48 * u, 0.02 * u);
      c.quadraticCurveTo(0, 0.12 * u, -0.48 * u, 0.02 * u); c.closePath(); fill(col); outline();
      if (!sil) { c.beginPath(); c.ellipse(0, -0.86 * u, 0.36 * u, 0.06 * u, 0, 0, TAU); fill(dk); }
      // the tassel: a cord from the top's middle over the back edge, then hanging
      const [tx, ty, a] = dangle(-0.36, -0.84, 0.5, 0);
      c.strokeStyle = sil ? col : '#1d1a17'; c.lineWidth = u * 0.06;
      c.beginPath(); c.moveTo(0, -0.88 * u); c.quadraticCurveTo(-0.2 * u, -0.96 * u, -0.36 * u, -0.84 * u); c.lineTo(tx, ty); c.stroke();
      c.save(); c.translate(tx, ty); c.rotate(a - Math.PI / 2);
      c.beginPath(); c.moveTo(-0.05 * u, 0); c.lineTo(-0.12 * u, 0.3 * u); c.lineTo(0.12 * u, 0.3 * u); c.lineTo(0.05 * u, 0); c.closePath(); fill(sil ? col : '#1d1a17');
      c.restore();
      break;
    }
    case 'akubra': case 'cork': {
      const cork = k === 'cork', w = cork ? 1.08 : 1.2;
      c.beginPath(); c.moveTo(-w * u, 0.12 * u); c.quadraticCurveTo(-0.9 * u, -0.16 * u, 0, -0.14 * u); c.quadraticCurveTo(0.9 * u, -0.16 * u, w * u, 0.12 * u);
      c.quadraticCurveTo(0.9 * u, -0.02 * u, 0, 0); c.quadraticCurveTo(-0.9 * u, -0.02 * u, -w * u, 0.12 * u); c.closePath(); fill(col); outline();
      c.beginPath(); c.moveTo(-0.5 * u, -0.12 * u);
      if (cork) { c.bezierCurveTo(-0.56 * u, -0.78 * u, 0.56 * u, -0.78 * u, 0.5 * u, -0.12 * u); }
      else { c.lineTo(-0.46 * u, -0.72 * u); c.quadraticCurveTo(-0.24 * u, -0.88 * u, 0, -0.7 * u); c.quadraticCurveTo(0.24 * u, -0.88 * u, 0.46 * u, -0.72 * u); c.lineTo(0.5 * u, -0.12 * u); }
      c.closePath(); fill(col); strip(-0.34, -0.12, dk); outline();
      if (!sil && !cork) { c.strokeStyle = dk; c.lineWidth = u * 0.05; c.beginPath(); c.moveTo(0, -0.7 * u); c.lineTo(0.02 * u, -0.48 * u); c.stroke(); }
      if (cork) for (const [i, x] of [-0.98, -0.62, 0.68, 1.0].entries()) { // corks on strings, swinging
        const y = 0.02 + 0.08 * Math.abs(x), [ex, ey, a] = dangle(x, y, 0.34 + 0.08 * (i % 2), i * 1.7);
        c.strokeStyle = sil ? col : '#3b3027'; c.lineWidth = u * 0.03; c.beginPath(); c.moveTo(x * u, y * u); c.lineTo(ex, ey); c.stroke();
        c.save(); c.translate(ex, ey); c.rotate(a - Math.PI / 2);
        rrect(c, -0.07 * u, -0.02 * u, 0.14 * u, 0.26 * u, 0.04 * u); fill(sil ? col : '#c9a576');
        if (!sil) { c.beginPath(); c.ellipse(0, 0.24 * u, 0.07 * u, 0.025 * u, 0, 0, TAU); fill('#9b7a4f'); }
        c.restore();
      }
      break;
    }
  }
}
