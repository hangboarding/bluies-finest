// First-run tour: a short welcome carousel, then a few spotlight tips the first
// time each page is opened. Progress is remembered in the user's settings.
import { $ } from '../lib/ui';
import { state, saveSettings } from '../lib/state';

interface Tip { sel: string; title: string; body: string; }
const PAGE_TIPS: Record<string, Tip[]> = {
  hang: [
    { sel: '#proto', title: 'Pick a protocol', body: 'Each one is a proven training plan with sensible defaults. ⚡ JUST LET ME HANG skips the theory. Pick “Custom protocol…” to save your own.' },
    { sel: '[data-p="about"]', title: 'Read the protocol', body: 'Every protocol comes with who designed it, what it’s for, its hang and rest times, recommended sets, intensity and how often to do it. Tap Hide to tuck it away once you know it.' },
    { sel: '#params', title: 'Tweak the numbers', body: 'Tap − and + to adjust. Tap any ⓘ to learn what a setting does. Everything is remembered for next time.' },
    { sel: '[data-p="grip"] summary', title: 'Hide what you don’t need', body: 'Sections can be hidden or shown with one tap, and they stay that way.' },
    { sel: '#start', title: 'Start hanging', body: 'You get a get-ready countdown, beeps for the last few seconds, and a “Let go” button if you drop early.' },
  ],
  feed: [{ sel: '#feedF', title: 'Everyone’s activity', body: 'Every saved session shows up here. Heart it ❤️ or leave a comment to hype each other up.' }],
  ranks: [
    { sel: '#cats', title: 'Lots of ways to win', body: 'Switch categories: strength, grip types, volume and consistency. Overall is the big one.' },
    { sel: '#podium', title: 'Top of the crag', body: 'Number one gets the crown. Strength is measured as % of bodyweight so it’s fair.' },
  ],
  stats: [
    { sel: '#hscale', title: 'Your consistency', body: 'Switch between week, month, 3 months and year. Tap any day to see what you did.' },
    { sel: '#ach', title: 'Achievements', body: 'Badges level up through 10 tiers from Iron to GOAT. Tap one for details. There are secret ones too 🤫' },
  ],
  profile: [
    { sel: '.upl', title: 'Your photo', body: 'Tap to add a photo. It shows next to your name on the leaderboard and in the activity feed.' },
    { sel: '.about', title: 'Your details', body: 'Set your bodyweight. It’s needed for accurate stats, because strength is scored as % of bodyweight. Age, height and location are optional. All of this is private. Tap Save when you’re done.' },
    { sel: '.boards', title: 'Your hangboards', body: 'Add the boards you train on. The ⭐ one is picked by default for new sessions, and you can remove any you don’t use.' },
    { sel: '.card:has(#mode)', title: 'Look & feel', body: 'Switch between dark and light mode, emoji or flat icons, and pick an accent colour.' },
    { sel: '.card:has([data-set="sound"])', title: 'Settings', body: 'Turn countdown sounds, vibration, the warm-up reminder and overtraining warnings on or off, choose which sections show on the Hang screen, and replay this tour.' },
    { sel: '.card:has(#dl)', title: 'Your data', body: 'Download everything you’ve logged as a file whenever you like. Change password and Delete account are at the very bottom.' },
  ],
};

const WELCOME = [
  ['🏔️', 'Welcome to Bluies Finest', 'Log hangboard sessions, follow proven protocols and compete with your mates.'],
  ['⏱', 'Smart timer', 'Get-ready countdown, beeps, rest timers and one-arm left/right switching. The screen stays awake while you hang.'],
  ['🏆', 'Compete & celebrate', 'Climb the leaderboard, unlock achievements and heart each other’s sessions.'],
  ['🔒', 'Your data, your call', 'Your data is private. Download or delete it any time from Profile.'],
];

export const resetTours = () => { state.settings.toursSeen = {}; saveSettings(); };

export async function maybeWelcome() {
  if (state.settings.toursSeen.welcome) return;
  await new Promise<void>(res => {
    let i = 0; const m = document.createElement('div'); m.className = 'modal welcome';
    const draw = () => {
      const [icon, h, b] = WELCOME[i]!;
      m.innerHTML = `<div class="card sheet center"><div class="big-ic">${icon}</div><h2>${h}</h2><p class="sub">${b}</p>
        <div class="tdots">${WELCOME.map((_, j) => `<i class="${j === i ? 'on' : ''}"></i>`).join('')}</div>
        <div class="row"><button class="big ghost" data-a="skip">Skip</button><button class="big" data-a="next">${i === WELCOME.length - 1 ? 'Let’s hang' : 'Next'}</button></div></div>`;
    };
    m.onclick = e => {
      const a = (e.target as HTMLElement).closest('[data-a]') as HTMLElement | null; if (!a) return;
      if (a.dataset.a === 'next' && i < WELCOME.length - 1) { i++; draw(); return; }
      m.remove(); state.settings.toursSeen.welcome = true; saveSettings(); res();
    };
    draw(); document.body.append(m);
  });
}

let running = false;
export function pageTour(page: string) {
  if (running || state.settings.toursSeen[page] || !state.settings.toursSeen.welcome) return;
  const tips = (PAGE_TIPS[page] ?? []).filter(t => $(t.sel)); if (!tips.length) return;
  running = true;
  let i = 0; const ov = document.createElement('div'); ov.className = 'tour';
  const HEADER = 64, TABS = 80; // fixed bars at the top and bottom of the screen
  let el: HTMLElement;
  // Position the highlight and the tip box around the current target. Re-run on scroll/resize
  // so it stays lined up even if the page is still settling.
  const place = () => {
    if (!el?.isConnected) return;
    const hole = ov.querySelector('.tour-hole') as HTMLElement, card = ov.querySelector('.tour-card') as HTMLElement;
    const r = el.getBoundingClientRect(), pad = 6;
    const top = Math.max(HEADER, r.top - pad), bottom = Math.min(innerHeight - TABS, r.bottom + pad);
    Object.assign(hole.style, { top: `${top}px`, left: `${Math.max(4, r.left - pad)}px`, width: `${Math.min(innerWidth - 8, r.width + pad * 2)}px`, height: `${Math.max(0, bottom - top)}px` });
    const h = card.offsetHeight + 14, below = innerHeight - TABS - bottom, above = top - HEADER;
    card.style.top = card.style.bottom = '';
    if (below >= h) card.style.top = `${bottom + 12}px`;
    else if (above >= h) card.style.bottom = `${innerHeight - top + 12}px`;
    else card.style.bottom = `${TABS + 8}px`; // big target: pin the tip above the tab bar
  };
  const finish = () => { ov.remove(); removeEventListener('scroll', place); removeEventListener('resize', place); running = false; state.settings.toursSeen[page] = true; saveSettings(); };
  const draw = () => {
    const t = tips[i]!; el = $(t.sel);
    ov.innerHTML = `<div class="tour-hole"></div><div class="tour-card"><b>${t.title}</b><p>${t.body}</p>
      <div class="tour-ft"><span>${i + 1} / ${tips.length}</span><button data-t="skip">Skip</button><button data-t="next" class="on">${i === tips.length - 1 ? 'Got it' : 'Next'}</button></div></div>`;
    // tall sections scroll to just under the header; small ones to the middle
    const tall = el.getBoundingClientRect().height > (innerHeight - HEADER - TABS) * 0.35;
    if (tall) scrollTo({ top: scrollY + el.getBoundingClientRect().top - HEADER - 10 }); else el.scrollIntoView({ block: 'center' });
    place(); requestAnimationFrame(place); setTimeout(place, 150); setTimeout(place, 400);
  };
  ov.onclick = e => {
    const b = (e.target as HTMLElement).closest('[data-t]') as HTMLElement | null; if (!b) return;
    if (b.dataset.t === 'next' && i < tips.length - 1) { i++; draw(); } else finish();
  };
  addEventListener('scroll', place, { passive: true }); addEventListener('resize', place);
  document.body.append(ov); draw();
}
