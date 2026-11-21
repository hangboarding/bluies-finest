import '@fontsource-variable/sora';
import './styles.css';
import './app.css';
import { $, $$, toast, esc } from './lib/ui';
import { ic, hydrateIcons, setIconMode } from './lib/icons';
import { state, initStore, loadUserData } from './lib/state';
import { setSound } from './lib/timer';
import { renderAuth } from './views/auth';
import { renderHang, hangBusy, hangPending } from './views/hang';
import { renderFeed } from './views/feed';
import { renderRanks } from './views/ranks';
import { renderStats } from './views/stats';
import { renderProfile } from './views/profile';
import { maybeWelcome, pageTour } from './views/tour';
import { queuedSessions, flushOutbox } from './lib/outbox';
import { openClimber } from './views/climber';
import { registerSW } from 'virtual:pwa-register';

export const ACCENTS = ['#3ddc84', '#2bb5a0', '#5aa9e6', '#b48cff', '#ff9f43', '#ff5a4e', '#f78fb3', '#f2c14e'];
type Page = 'hang' | 'feed' | 'ranks' | 'stats' | 'profile';
const PAGES: { id: Page; label: string; icon: string; render: (el: HTMLElement) => void | Promise<void> }[] = [
  { id: 'hang', label: 'Hang', icon: 'tabHang', render: renderHang },
  { id: 'feed', label: 'Activity', icon: 'tabFeed', render: renderFeed },
  { id: 'ranks', label: 'Ranks', icon: 'tabRanks', render: renderRanks },
  { id: 'stats', label: 'Stats', icon: 'tabStats', render: renderStats },
  { id: 'profile', label: 'Profile', icon: 'tabProfile', render: renderProfile },
];
let current: Page = 'hang';

export function applyTheme() {
  const p = state.settings.prefs, root = document.documentElement;
  root.dataset.mode = p.mode; root.dataset.icons = p.icons; root.style.setProperty('--acc', p.acc);
  setIconMode(p.icons); setSound(p.sound); (window as any).__prefs = p;
  $('meta[name="theme-color"]')?.setAttribute('content', p.mode === 'dark' ? '#0d1511' : '#e9efeb');
}
export function refreshHeader() { /* header shows only the logo + name now; kept for views that call it */ }

/** Redraw the tabs and the current page in place, e.g. after switching icon style. */
export async function rerender() {
  const page = current;
  shell();
  current = page;
  await go(page);
}

export async function go(page: Page) {
  if (current === 'hang' && page !== 'hang' && hangBusy()) { toast('Finish or cancel your session first'); return; }
  current = page;
  for (const p of PAGES) {
    $(`#view-${p.id}`).classList.toggle('hide', p.id !== page);
    $(`#tabs [data-v="${p.id}"]`).classList.toggle('on', p.id === page);
    $(`#tabs [data-v="${p.id}"]`).setAttribute('aria-current', p.id === page ? 'page' : 'false');
  }
  scrollTo(0, 0);
  if (page !== 'hang' || !$('#view-hang').childElementCount) await PAGES.find(p => p.id === page)!.render($(`#view-${page}`));
  if (current === page) pageTour(page); // user may have switched tabs while this page loaded
}

function shell() {
  $('#app').innerHTML = `
    <header><img src="${import.meta.env.BASE_URL}logo.svg" alt="" width="30" height="30" class="logo"><h1>Bluies <span>Finest</span></h1></header>
    <main>${PAGES.map(p => `<div id="view-${p.id}" class="hide"></div>`).join('')}</main>
    <nav class="tabs" id="tabs" aria-label="Main">${PAGES.map(p => `<button data-v="${p.id}"><b>${ic(p.icon)}</b>${p.label}</button>`).join('')}</nav>`;
  hydrateIcons($('#tabs'));
  $$('#tabs button').forEach(b => b.addEventListener('click', () => go(b.dataset.v as Page)));
}

function errorScreen(msg: string) {
  $('#app').innerHTML = `<main><div class="auth"><img src="${import.meta.env.BASE_URL}logo.svg" alt="" class="auth-logo" width="72" height="72">
    <h2 style="margin-top:16px">Couldn't load your data</h2><p class="sub">${esc(msg)}</p>
    <button class="big" id="retry">Try again</button><div class="links"><a id="out">Log out</a></div></div></main>`;
  $('#retry').onclick = () => location.reload();
  $('#out').onclick = async () => { await state.store.signOut().catch(() => {}); location.reload(); };
}

/** Password-reset emails link here with ?token_hash=…&type=recovery. Exchanging the hash works
 *  in any browser (unlike the PKCE ?code= flow, which only works where the reset was requested). */
async function handleRecoveryLink() {
  const q = new URLSearchParams(location.search), th = q.get('token_hash');
  if (!th || q.get('type') !== 'recovery') return;
  history.replaceState(null, '', location.pathname + '#reset');
  const client = (state.store as any).client;
  if (!client) return;
  const { error } = await client.auth.verifyOtp({ token_hash: th, type: 'recovery' });
  if (error) toast('That reset link has expired or was already used — request a new one', 6000);
}

async function boot() {
  try { await initStore(); } catch (e: any) { errorScreen(e.message ?? 'Unknown error'); return; }
  await handleRecoveryLink();
  state.store.onAuthChange(() => location.reload());
  if (!state.store.currentUserId()) {
    applyTheme();
    $('#app').innerHTML = '<main id="auth"></main>';
    if (location.hash === '#reset') {
      history.replaceState(null, '', location.pathname);
      toast('That reset link has expired or was opened in another browser — request a new one', 6000);
      renderAuth($('#auth'), 'forgot');
    } else renderAuth($('#auth'), 'in');
    return;
  }
  // Never continue with half-loaded data: saving default settings over the real ones would wipe them.
  try { await loadUserData(); } catch (e: any) { errorScreen(e.message ?? 'Check your connection and try again.'); return; }
  // sessions saved offline on this phone show up straight away, then upload in the background
  state.sessions.unshift(...queuedSessions());
  flushOutbox();
  applyTheme();
  if (location.hash === '#reset') { $('#app').innerHTML = '<main id="auth"></main>'; renderAuth($('#auth'), 'reset'); return; }
  shell();
  await maybeWelcome();
  await go('hang');
}

// App updates: download quietly, then switch to the new version only when the user isn't mid-session.
const updateSW = registerSW({
  onNeedRefresh() {
    const apply = () => { if (hangBusy() || hangPending()) setTimeout(apply, 15_000); else updateSW(true); };
    apply();
  },
  onRegisteredSW(_url, reg) { if (reg) setInterval(() => reg.update().catch(() => {}), 60 * 60e3); },
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') navigator.serviceWorker?.getRegistration().then(r => r?.update()).catch(() => {});
});
// Re-draw Stats when offline sessions finish uploading.
document.addEventListener('bf:sessions-changed', () => { if (current === 'stats') renderStats($('#view-stats')); });
// Tap any climber's name or photo to open their profile.
document.addEventListener('click', e => {
  const el = (e.target as HTMLElement).closest('[data-uid]') as HTMLElement | null;
  if (el && !(e.target as HTMLElement).closest('button:not([data-uid]),input,a:not([data-uid])')) openClimber(el.dataset.uid!);
});
boot();
