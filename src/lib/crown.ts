// Champion crowns. Every season title makes a climber's crown grander, and the details
// (gem colours, velvet, tip style) are seeded from their id so no two champions look alike.
//   0 titles  plain gold crown, 3 points (anyone who is #1 on a board)
//   1+        one more point per title (up to 7) and one more band gem per title (up to 5)
//   3+        gems on the tips instead of gold balls
//   4+        velvet cap
//   5+        a little bigger each time, with an orb and cross on top
//   8+        platinum
//   12+       prismatic, shifting colour
import { state } from './state';

const GEMS = ['#e0115f', '#1f6fe0', '#14a36b', '#9b4dff', '#ff8a1f', '#22c6d8', '#ffffff'];
const VELVET = ['#8e1b2e', '#4b1f7a', '#173a7a', '#145c3a'];
let seq = 0;

function hash(s: string) { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }

/** Number of season titles won up to and including `upTo` (a season start date), or all of them. */
export function titlesOf(uid: string, upTo?: string) {
  return new Set(state.champions.filter(c => c.userId === uid && (!upTo || c.seasonStart <= upTo)).map(c => c.seasonStart)).size;
}

export function crownName(n: number) {
  return n >= 12 ? 'Prismatic crown' : n >= 8 ? 'Platinum crown' : n >= 4 ? 'Royal crown' : n >= 1 ? 'Champion crown' : 'Crown';
}

/** Inline SVG crown for a climber with `n` season titles. */
export function crownSvg(uid: string, n = titlesOf(uid), cls = '') {
  const id = `cr${++seq}`, h = hash(uid), r = (k: number) => (h >>> k) & 0xff;
  const pts = Math.min(3 + n, 7), bandGems = Math.min(n, 5), tipGems = n >= 3, velvet = n >= 4, orb = n >= 5;
  const metal = n >= 12 ? ['#ff9de2', '#9be7ff', '#fff59b', '#b8ffb0'] : n >= 8 ? ['#8d99a6', '#e9eef3', '#ffffff', '#b7c2cc'] : ['#a9822c', '#f2c14e', '#fff4c2', '#c9962e'];
  const gem = (i: number) => GEMS[(r(0) + i * (1 + (r(8) % 3))) % GEMS.length]!;
  const velvetCol = VELVET[r(16) % VELVET.length]!, diamondTips = r(24) % 2 === 1;
  // outline: tips spread across 8..56, taller in the middle; valleys between them
  const L = 8, R = 56, top = orb ? 20 : 12, valley = 32;
  const xs = Array.from({ length: pts }, (_, i) => L + (R - L) * i / (pts - 1));
  const tipY = (x: number) => top + Math.abs(x - 32) / 24 * 8;
  let d = `M${L} 44 L${L} ${tipY(L)}`;
  for (let i = 1; i < pts; i++) { const mid = (xs[i - 1]! + xs[i]!) / 2; d += ` L${mid} ${valley} L${xs[i]} ${tipY(xs[i]!)}`; }
  d += ` L${R} 44 Z`;
  const tip = (x: number, i: number) => {
    const y = tipY(x);
    if (!tipGems) return `<circle cx="${x}" cy="${y - 1}" r="3" fill="url(#${id}m)"/>`;
    return diamondTips
      ? `<path d="M${x} ${y - 6} l3.6 4.6 -3.6 4.6 -3.6 -4.6Z" fill="${gem(i + 3)}" stroke="#fff8" stroke-width=".6"/>`
      : `<circle cx="${x}" cy="${y - 1.5}" r="3.4" fill="${gem(i + 3)}" stroke="#fff8" stroke-width=".6"/><circle cx="${x - 1}" cy="${y - 2.6}" r="1" fill="#fffc"/>`;
  };
  const gems = Array.from({ length: bandGems }, (_, i) => {
    const x = 32 + (i - (bandGems - 1) / 2) * 9.5;
    return `<ellipse cx="${x}" cy="48" rx="3.4" ry="3" fill="${gem(i)}" stroke="#fff9" stroke-width=".6"/><circle cx="${x - 1.1}" cy="47" r=".9" fill="#fffd"/>`;
  }).join('');
  const scale = 1 + Math.max(0, Math.min(n, 12) - 4) * 0.06;
  return `<svg class="crown-svg${n >= 12 ? ' prism' : ''}${n >= 1 ? ' won' : ''} ${cls}" style="--cs:${scale.toFixed(2)}" viewBox="0 0 64 56" role="img" aria-label="${crownName(n)}${n ? `, ${n} season title${n > 1 ? 's' : ''}` : ''}">
    <defs><linearGradient id="${id}m" x1="0" y1="0" x2="1" y2="1">${metal.map((c, i) => `<stop offset="${i / (metal.length - 1)}" stop-color="${c}"/>`).join('')}</linearGradient></defs>
    ${velvet ? `<path d="M11 42 C11 ${top - 12} 53 ${top - 12} 53 42Z" fill="${velvetCol}"/>` : ''}
    ${orb ? `<circle cx="32" cy="${top - 5}" r="4.2" fill="url(#${id}m)" stroke="#0003" stroke-width=".6"/><rect x="31" y="${top - 16}" width="2" height="8" rx="1" fill="url(#${id}m)"/><rect x="28.5" y="${top - 13.5}" width="7" height="2" rx="1" fill="url(#${id}m)"/>` : ''}
    <path d="${d}" fill="url(#${id}m)" stroke="#0004" stroke-width=".8" stroke-linejoin="round"/>
    ${xs.map(tip).join('')}
    <rect x="${L - 1}" y="42" width="${R - L + 2}" height="12" rx="3" fill="url(#${id}m)" stroke="#0004" stroke-width=".8"/>
    <rect x="${L}" y="43" width="${R - L}" height="2" rx="1" fill="#fff6"/>
    ${gems}
  </svg>`;
}
