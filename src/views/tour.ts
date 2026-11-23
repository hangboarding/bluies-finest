// First-run tour: a short welcome carousel, then a few spotlight tips the first
// time each page is opened. Progress is remembered in the user's settings.
// Tips added later have an `id`: people who'd already seen that page's tour get just those, once.
import { $ } from '../lib/ui';
import { state, saveSettings } from '../lib/state';
import { installButton, install } from '../lib/install';

interface Tip { sel: string; title: string; body: string; id?: string; }
const PAGE_TIPS: Record<string, Tip[]> = {
  hang: [
    { sel: '#hangMode', title: 'One protocol or a workout', body: 'Single session runs one protocol. Workout runs a list of them back to back, with a rest between each. Build workouts in the Workouts tab.', id: 'workouts' },
    { sel: '#wkQ', title: 'Your workout', body: 'Tap an exercise to change its numbers or grip, or a rest to change how long it is. Start runs them all, and each one is saved as its own session.', id: 'workout-card' },
    { sel: '#protoBtn', title: 'Pick a protocol', body: 'Each one is a proven training plan with sensible defaults. ⚡ JUST LET ME HANG skips the theory. Pick “Custom exercise…” at the top to make your own.' },
    { sel: '[data-p="about"]', title: 'Read the protocol', body: 'Every protocol comes with who designed it, what it’s for, its hang and rest times, recommended sets, intensity and how often to do it. Tap Hide to tuck it away once you know it.' },
    { sel: '#params', title: 'Tweak the numbers', body: 'Tap − and + to adjust. Tap any ⓘ to learn what a setting does. Picking a protocol loads its recommended settings (pick it again to reset them); your load is remembered for each one.', id: 'presets' },
    { sel: '[data-p="grip"] summary', title: 'Hide what you don’t need', body: 'Sections can be hidden or shown with one tap, and they stay that way.' },
    { sel: '#start', title: 'Start hanging', body: 'You get a get-ready countdown, beeps for the last few seconds, and a “Let go” button if you drop early.' },
  ],
  workouts: [
    { sel: '#wkNew', title: 'Build a workout', body: 'Queue up protocols, set the rest between them and save the list, or just start it. Each exercise is saved as its own session.' },
    { sel: '#wkProtos', title: 'Your own protocols', body: 'Rename or delete the protocols you’ve saved. Deleting one also takes it out of your workouts.', id: 'protocols' },
    { sel: '[data-p="tpl"] summary', title: 'Starter workouts', body: 'Ready-made workouts that use your own loads. Tap Use to tweak one and save it.' },
    { sel: '#recent', title: 'Your history', body: 'Every session you’ve logged. Tap ↺ to do one again with the same settings, or edit and delete them.' },
  ],
  feed: [{ sel: '#feedF', title: 'Everyone’s activity', body: 'Every saved session shows up here. Heart it ❤️ or leave a comment to hype each other up.' }],
  ranks: [
    { sel: '#cats', title: 'Lots of ways to win', body: 'Switch categories: strength, grip types, volume and consistency. Overall is the big one.' },
    { sel: '#podium', title: 'Top of the crag', body: 'Number one gets the crown. Strength is measured as % of bodyweight so it’s fair.' },
  ],
  stats: [
    { sel: '#hscale', title: 'Your consistency', body: 'Switch between week, month, 3 months and year. Tap any day to see what you did.' },
    { sel: '#view-stats > .card:first-child', title: 'Looking for your sessions?', body: 'Every session you’ve logged is in History on the Workouts tab, where you can edit one or do it again.', id: 'history' },
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
  ['📋', 'Workouts', 'Line up a few protocols with a rest between each and run them back to back. Each one is logged as its own session.'],
  ['🏆', 'Compete & celebrate', 'Climb the leaderboard, unlock achievements and heart each other’s sessions.'],
  ['🔒', 'Your data, your call', 'Your data is private. Download or delete it any time from Profile.'],
];

export const resetTours = () => { state.settings.toursSeen = {}; saveSettings(); };

/** Shows the welcome carousel the first time. Resolves true if it was shown. */
export async function maybeWelcome(): Promise<boolean> {
  if (state.settings.toursSeen.welcome) return false;
  await new Promise<void>(res => {
    let i = 0; const m = document.createElement('div'); m.className = 'modal welcome';
    const draw = () => {
      const [icon, h, b] = WELCOME[i]!;
      m.innerHTML = `<div class="card sheet center"><div class="big-ic">${icon}</div><h2>${h}</h2><p class="sub">${b}</p>
        ${i === 0 ? installButton() : ''}
        <div class="tdots">${WELCOME.map((_, j) => `<i class="${j === i ? 'on' : ''}"></i>`).join('')}</div>
        <div class="row"><button class="big ghost" data-a="skip">Skip</button><button class="big" data-a="next">${i === WELCOME.length - 1 ? 'Let’s hang' : 'Next'}</button></div></div>`;
    };
    m.onclick = e => {
      const a = (e.target as HTMLElement).closest('[data-a]') as HTMLElement | null; if (!a) return;
      if (a.dataset.a === 'install') { install().then(draw); return; }
      if (a.dataset.a === 'next' && i < WELCOME.length - 1) { i++; draw(); return; }
      document.removeEventListener('bf:installable', redraw);
      m.remove(); state.settings.toursSeen.welcome = true; saveSettings(); res();
    };
    // Chrome/Edge say they can install a moment after load: add the button then
    const redraw = () => { if (i === 0) draw(); };
    document.addEventListener('bf:installable', redraw);
    draw(); document.body.append(m);
  });
  return true;
}

let running = false;
export function pageTour(page: string) {
  const seen = state.settings.toursSeen;
  if (running || !seen.welcome) return;
  // First visit: the whole tour. After that: only newer tips (with an id) not seen yet.
  const tips = (PAGE_TIPS[page] ?? []).filter(t => (!seen[page] || (t.id && !seen[`${page}.${t.id}`]))
    && $(t.sel)?.getClientRects().length); // skip sections the user has hidden (an id'd tip waits until it's showing)
  if (!tips.length) return;
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
  const finish = () => {
    ov.remove(); removeEventListener('scroll', place); removeEventListener('resize', place); running = false;
    seen[page] = true; for (const t of tips) if (t.id) seen[`${page}.${t.id}`] = true;
    saveSettings();
  };
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
