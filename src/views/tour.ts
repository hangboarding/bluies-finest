// First-run tour: a short welcome carousel, then a few spotlight tips the first
// time each page is opened. Progress is remembered in the user's settings.
import { $ } from '../lib/ui';
import { state, saveSettings } from '../lib/state';

interface Tip { sel: string; title: string; body: string; }
const PAGE_TIPS: Record<string, Tip[]> = {
  hang: [
    { sel: '#proto', title: 'Pick a protocol', body: 'Each one is a proven training plan with sensible defaults. ⚡ JUST LET ME HANG skips the theory. Pick “Custom protocol…” to save your own.' },
    { sel: '#params', title: 'Tweak the numbers', body: 'Tap − and + to adjust. Tap any ⓘ to learn what a setting does. Everything is remembered for next time.' },
    { sel: '[data-p="grip"] summary', title: 'Hide what you don’t need', body: 'Sections can be hidden or shown with one tap — they stay that way.' },
    { sel: '#start', title: 'Start hanging', body: 'You get a get-ready countdown, beeps for the last few seconds, and a “Let go” button if you drop early.' },
  ],
  feed: [{ sel: '#feedF', title: 'The crew’s activity', body: 'Every saved session shows up here. Heart it ❤️ or leave a comment to hype each other up.' }],
  ranks: [
    { sel: '#cats', title: 'Lots of ways to win', body: 'Switch categories: strength, grip types, volume and consistency. Overall is the big one.' },
    { sel: '#podium', title: 'Top of the crag', body: 'Number one gets the crown. Strength is measured as % of bodyweight so it’s fair.' },
  ],
  stats: [
    { sel: '#hscale', title: 'Your consistency', body: 'Switch between week, month, 3 months and year. Tap any day to see what you did.' },
    { sel: '#ach', title: 'Achievements', body: 'Badges level up through 10 tiers from Iron to GOAT. Tap one for details. There are secret ones too 🤫' },
  ],
  profile: [{ sel: '.upl', title: 'Make it yours', body: 'Add a photo, set your bodyweight (private), add your boards and pick a theme. You can replay this tour from here.' }],
};

const WELCOME = [
  ['🏔️', 'Welcome to Bluies Finest', 'Log hangboard sessions, follow proven protocols and compete with the crew.'],
  ['⏱', 'Smart timer', 'Get-ready countdown, beeps, rest timers and one-arm left/right switching. The screen stays awake while you hang.'],
  ['🏆', 'Compete & celebrate', 'Climb the leaderboard, unlock achievements and heart each other’s sessions.'],
  ['🔒', 'Your data, your call', 'Bodyweight is private. Download or delete your data any time from Profile.'],
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
  const finish = () => { ov.remove(); running = false; state.settings.toursSeen[page] = true; saveSettings(); };
  const draw = () => {
    const t = tips[i]!, el = $(t.sel); el.scrollIntoView({ block: 'center' });
    requestAnimationFrame(() => {
      const r = el.getBoundingClientRect(), pad = 6, below = r.bottom + 190 < innerHeight;
      ov.innerHTML = `<div class="tour-hole" style="top:${r.top - pad}px;left:${Math.max(4, r.left - pad)}px;width:${Math.min(innerWidth - 8, r.width + pad * 2)}px;height:${r.height + pad * 2}px"></div>
        <div class="tour-card" style="${below ? `top:${r.bottom + 14}px` : `bottom:${innerHeight - r.top + 14}px`}"><b>${t.title}</b><p>${t.body}</p>
        <div class="tour-ft"><span>${i + 1} / ${tips.length}</span><button data-t="skip">Skip</button><button data-t="next" class="on">${i === tips.length - 1 ? 'Got it' : 'Next'}</button></div></div>`;
    });
  };
  ov.onclick = e => {
    const b = (e.target as HTMLElement).closest('[data-t]') as HTMLElement | null; if (!b) return;
    if (b.dataset.t === 'next' && i < tips.length - 1) { i++; draw(); } else finish();
  };
  document.body.append(ov); draw();
}
