// Animated sign-in logo: Mt Solitary draws itself, fills in, then a little climber
// scrambles up the ridge and celebrates on the summit.
const G2 = '#6f8597', G3 = '#4f6474', CLIFF_C = '#c9d6df', GOLD = '#f2c14e';
// Mt Solitary: long cliff-banded plateau rising to the dome at the east end.
const M = 'M8 94 L17 62 L24 55 L62 54 L73 49 L82 37 Q90 30 97 36 L103 49 L112 94 Z';
const CLIFF = 'M17 62 L24 55 L62 54 L73 49 L82 37 Q90 30 97 36 L103 49 L99 53 L84 50 L75 58 L24 66 Z';
const ROUTE = 'M106 88 L100 76 L103 68 L99 60 L101 52 L95 42 L90 33';

export function animatedLogo(size = 128) {
  return `<svg class="logo-anim" width="${size}" height="${size}" viewBox="0 0 120 120" role="img" aria-label="Bluies Finest">
  <path class="la-fill" d="${M}" fill="${G2}"/>
  <path class="la-shade" d="M8 94 L17 62 L24 66 L75 58 L41 94 Z" fill="${G3}"/>
  <path class="la-snow" d="${CLIFF}" fill="${CLIFF_C}"/>
  <path class="la-draw" style="--len:1;--d:1.5s" pathLength="1" d="${M}" fill="none" stroke="${CLIFF_C}" stroke-width="3" stroke-linejoin="round"/>
  <path class="la-draw" style="--len:120;--d:.9s;--delay:1.3s" d="M2 98 H118" stroke="${G3}" stroke-width="4" stroke-linecap="round"/>
  <!-- the route the climber takes up the dome, drawn as a dotted line behind them -->
  <path class="la-route" d="${ROUTE}" fill="none" stroke="${GOLD}" stroke-width="2" stroke-dasharray="1 4" stroke-linecap="round"/>
  <!-- climber (moves along the route) -->
  <g class="la-climber" fill="none" stroke="${GOLD}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <g class="la-limbs" transform="scale(1.35)">
      <circle cx="-1.5" cy="-9" r="2.6" fill="${GOLD}" stroke="none"/>
      <path d="M-1 -6 L1 1"/>
      <path class="la-armA" d="M-0.5 -4.5 L-5 -9.5"/>
      <path class="la-armB" d="M-0.5 -4.5 L3.5 -1.5"/>
      <path class="la-legA" d="M1 1 L-3 5"/>
      <path class="la-legB" d="M1 1 L5.5 3.5"/>
    </g>
    <animateMotion class="la-motion" dur="2.4s" begin="indefinite" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".45 0 .4 1"
      path="${ROUTE}"/>
  </g>
  <!-- summit celebration -->
  <g class="la-summit" stroke="${GOLD}" stroke-width="2.2" stroke-linecap="round" fill="none"><g transform="translate(30 8) translate(60 14) scale(1.3) translate(-60 -14)">
    <circle cx="60" cy="8" r="2.6" fill="${GOLD}" stroke="none"/>
    <path d="M60 10.5 V17 M60 12.5 L55.5 7 M60 12.5 L64.5 7 M60 17 L57 21.5 M60 17 L63 21.5"/>
    <path class="la-spark" d="M49 4 l-3-2 M71 4 l3-2 M60 -2 v-3" stroke-width="1.8"/>
  </g></g>
</svg>`;
}

/** Start the climber part once the SVG is in the page (SMIL needs to be triggered after insertion). */
export function playLogo(root: ParentNode = document) {
  const svg = root.querySelector('.logo-anim') as SVGSVGElement | null; if (!svg) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { svg.classList.add('la-static'); return; }
  const motion = svg.querySelector('.la-motion') as any;
  let started = false;
  const climb = () => {
    if (started || !svg.isConnected) return; started = true;
    svg.classList.add('la-climbing'); motion?.beginElement?.();
    motion?.addEventListener?.('endEvent', () => svg.classList.add('la-top'), { once: true });
    setTimeout(() => svg.classList.add('la-top'), 2600); // fallback if endEvent isn't fired
  };
  // Wait for the mountain to finish drawing (the cliff band fades in last), with a fallback.
  svg.querySelector('.la-snow')?.addEventListener('animationend', () => setTimeout(climb, 150), { once: true });
  setTimeout(climb, 4000);
}
