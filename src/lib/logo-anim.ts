// Animated sign-in logo: the peak draws itself, fills in, then a little climber
// scrambles up the ridge and celebrates on the summit.
const G = '#97abbb', G2 = '#6f8597', SNOW = '#eef5f0', GOLD = '#f2c14e';

export function animatedLogo(size = 128) {
  return `<svg class="logo-anim" width="${size}" height="${size}" viewBox="0 0 120 120" role="img" aria-label="Bluies Finest">
  <path class="la-fill" d="M10 100 L60 22 L110 100 Z" fill="${G}"/>
  <path class="la-shade" d="M10 100 L60 22 L66 62 L46 100 Z" fill="${G2}"/>
  <path class="la-draw" style="--len:260;--d:1.5s" d="M10 100 L60 22 L110 100 Z" fill="none" stroke="${G}" stroke-width="5" stroke-linejoin="round"/>
  <path class="la-snow" d="M60 22 L73.5 43 L67.2 40 L60.6 46.5 L54 40 L46.2 43.5 Z" fill="${SNOW}"/>
  <path class="la-draw" style="--len:90;--d:.7s;--delay:1.1s" d="M60 22 L73.5 43 L67.2 40 L60.6 46.5 L54 40 L46.2 43.5 Z" fill="none" stroke="${SNOW}" stroke-width="3" stroke-linejoin="round"/>
  <path class="la-draw" style="--len:120;--d:.9s;--delay:1.3s" d="M4 104 H116" stroke="${G2}" stroke-width="4" stroke-linecap="round"/>
  <!-- the route the climber takes, drawn as a dotted line behind them -->
  <path class="la-route" d="M101 93 L92 79 L95 74 L84 64 L86 58 L76 47 L72 39 L64 28" fill="none" stroke="${GOLD}" stroke-width="2" stroke-dasharray="1 4" stroke-linecap="round"/>
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
      path="M101 93 L92 79 L95 74 L84 64 L86 58 L76 47 L72 39 L64 28"/>
  </g>
  <!-- summit celebration -->
  <g class="la-summit" stroke="${GOLD}" stroke-width="2.2" stroke-linecap="round" fill="none"><g transform="translate(60 14) scale(1.3) translate(-60 -14)">
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
  // Wait for the mountain to finish drawing (the snowcap fades in last), with a fallback.
  svg.querySelector('.la-snow')?.addEventListener('animationend', () => setTimeout(climb, 150), { once: true });
  setTimeout(climb, 4000);
}
