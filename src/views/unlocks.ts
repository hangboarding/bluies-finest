// Achievement pop-ups. Whatever earns a badge (saving a session, adding a photo or a board, a secret found
// mid-session, hearts from friends), it pops up as soon as the app knows. What's been shown is kept in
// settings, so each one pops once, on whichever device sees it first.
import { state, saveSettings, achievementCtx } from '../lib/state';
import { earned, newUnlocks, mergeSeen, recheckSeen, type Unlock } from '../lib/achievements';
import { ic, hydrateIcons } from '../lib/icons';
import { esc, vibrate } from '../lib/ui';
import { confetti } from '../lib/confetti';
import { go } from '../main';

let wait: number | undefined;
/** Look for anything newly earned and pop it up. Waits a moment, so a few changes in a row pop up together. */
export function checkUnlocks(delay = 250) {
  clearTimeout(wait);
  wait = window.setTimeout(() => { wait = undefined; check(); }, delay);
}

function check() {
  if (!state.loaded || !state.me) return;
  const S = state.settings, now = earned(achievementCtx());
  // the first check on this version: what's already earned was celebrated before, so it doesn't pop
  if (!S.achSeen) { S.achSeen = now; saveSettings(); return; }
  if (recheckSeen(S.achSeen, now)) saveSettings(); // a badge's rule was tightened: re-work what it shows
  const fresh = newUnlocks(S.achSeen, now);
  if (!fresh.length) return;
  S.achSeen = mergeSeen(S.achSeen, now); saveSettings();
  pop(fresh);
}

let hideT: number | undefined;
function pop(xs: Unlock[]) {
  document.querySelector('.unlock')?.remove(); clearTimeout(hideT);
  const title = xs.length > 1 ? `${xs.length} achievements unlocked` : 'Achievement unlocked', shown = xs.slice(0, 4);
  const line = (u: Unlock) => `<span class="unlock-row"${u.colour ? ` style="--tc:${u.colour}"` : ''}><span class="unlock-ic">${ic(u.icon)}</span>`
    + `<span><b>${u.secret ? 'Secret: ' : ''}${esc(u.name)}</b>${u.tier ? `<small>${esc(u.tier)}</small>` : ''}</span></span>`;
  const el = document.createElement('button'); el.type = 'button'; el.className = 'unlock'; el.setAttribute('role', 'status');
  el.setAttribute('aria-label', `${title}: ${xs.map(u => u.name + (u.tier ? ` ${u.tier}` : '')).join(', ')}. Tap to see your badges.`);
  el.innerHTML = `<small class="unlock-hd">${ic('award')} ${title}</small>${shown.map(line).join('')}`
    + (xs.length > shown.length ? `<small class="unlock-more">and ${xs.length - shown.length} more</small>` : '');
  document.body.append(el); hydrateIcons(el);
  requestAnimationFrame(() => el.classList.add('on'));
  confetti(); vibrate([60, 40, 120]);
  const hide = () => { el.classList.remove('on'); setTimeout(() => el.remove(), 350); };
  hideT = window.setTimeout(hide, 4500 + 800 * shown.length);
  el.addEventListener('click', async () => {
    clearTimeout(hideT); hide();
    if (document.querySelector('.modal')) return; // don't pull someone out of what they're doing
    if (await go('stats')) document.querySelector('#ach')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
}

// other climbers can earn you badges too (hearts, a season won): check whenever their activity is refreshed
document.addEventListener('bf:sessions-changed', () => checkUnlocks());
