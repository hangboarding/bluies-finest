import '@fontsource-variable/sora';
import './styles.css';
import './app.css';
import { $, $$, toast, esc } from './lib/ui';
import { ic, hydrateIcons, setIconMode } from './lib/icons';
import { state, initStore, loadUserData } from './lib/state';
import { setSound } from './lib/timer';
import { renderAuth } from './views/auth';
import { renderHang, hangBusy, hangPending, drawLoadHint } from './views/hang';
import { renderRanks } from './views/ranks';
import { renderStats } from './views/stats';
import { renderProfile } from './views/profile';
import { maybeWelcome, pageTour } from './views/tour';
import { queuedSessions, flushOutbox, dropUploaded } from './lib/outbox';
import { openClimber } from './views/climber';
import { bellHtml, wireBell } from './views/notifs';
import { syncPush, disablePush } from './lib/push';
import { renderFeed, focusPost } from './views/feed';
import { registerSW } from 'virtual:pwa-register';
import { maybeInstallNudge } from './lib/install'; // imported early so it catches the browser's install prompt

export const ACCENTS = ['#8fb3d1', '#3ddc84', '#2bb5a0', '#5aa9e6', '#b48cff', '#ff9f43', '#ff5a4e', '#f78fb3', '#f2c14e'];
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
  // text/icons drawn on top of the accent (buttons, selected chips) must stay readable for any custom colour
  root.style.setProperty('--onacc', readableOn(p.acc));
  setIconMode(p.icons); setSound(p.sound); (window as any).__prefs = p;
  $('meta[name="theme-color"]')?.setAttribute('content', p.mode === 'dark' ? '#0f1419' : '#e8edf1');
}
/** Dark or white text, whichever contrasts better with the given hex colour. */
export function readableOn(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return '#06110b';
  const n = parseInt(m[1]!, 16), ch = [n >> 16, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  const L = 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
  return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? '#06110b' : '#ffffff';
}
export function refreshHeader() { /* header shows only the logo + name now; kept for views that call it */ }

/** Redraw the tabs and the current page in place, e.g. after switching icon style. */
export async function rerender() {
  const page = current;
  shell();
  current = page;
  await go(page);
}

export const currentPage = () => current;
/** Switch tab. Returns false (and stays put) while a hang session is running. */
export async function go(page: Page): Promise<boolean> {
  if (current === 'hang' && page !== 'hang' && hangBusy()) { toast('Finish or cancel your session first'); return false; }
  current = page;
  for (const p of PAGES) {
    $(`#view-${p.id}`).classList.toggle('hide', p.id !== page);
    $(`#tabs [data-v="${p.id}"]`).classList.toggle('on', p.id === page);
    $(`#tabs [data-v="${p.id}"]`).setAttribute('aria-current', p.id === page ? 'page' : 'false');
  }
  scrollTo(0, 0);
  if (page !== 'hang' || !$('#view-hang').childElementCount) await PAGES.find(p => p.id === page)!.render($(`#view-${page}`));
  else drawLoadHint(); // the Hang page is kept between tabs; bodyweight may have changed in Profile
  if (current === page) pageTour(page); // user may have switched tabs while this page loaded
  return true;
}

function shell() {
  $('#app').innerHTML = `
    <header><img src="${import.meta.env.BASE_URL}logo.svg" alt="" width="30" height="30" class="logo"><h1>Bluies <span>Finest</span></h1>${bellHtml()}</header>
    <main>${PAGES.map(p => `<div id="view-${p.id}" class="hide"></div>`).join('')}</main>
    <nav class="tabs" id="tabs" aria-label="Main">${PAGES.map(p => `<button data-v="${p.id}"><b>${ic(p.icon)}</b>${p.label}</button>`).join('')}</nav>`;
  hydrateIcons($('#tabs')); hydrateIcons($('header'));
  wireBell(sid => { if (!(current === 'hang' && hangBusy())) { focusPost(sid); go('feed'); } else toast('Finish or cancel your session first'); });
  $$('#tabs button').forEach(b => b.addEventListener('click', () => go(b.dataset.v as Page)));
}

function errorScreen(msg: string) {
  $('#app').innerHTML = `<main><div class="auth"><img src="${import.meta.env.BASE_URL}logo.svg" alt="" class="auth-logo" width="72" height="72">
    <h2 style="margin-top:16px">Couldn't load your data</h2><p class="sub">${esc(msg)}</p>
    <button class="big" id="retry">Try again</button><div class="links"><a id="out">Log out</a></div></div></main>`;
  $('#retry').onclick = () => location.reload();
  $('#out').onclick = async () => { await disablePush().catch(() => {}); await state.store.signOut().catch(() => {}); location.reload(); };
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
  if (error) toast('That reset link has expired or was already used. Request a new one.', 6000);
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
      toast('That reset link has expired or was opened in another browser. Request a new one.', 6000);
      renderAuth($('#auth'), 'forgot');
    } else renderAuth($('#auth'), location.hash === '#join' ? 'up' : 'in');
    return;
  }
  // Never continue with half-loaded data: saving default settings over the real ones would wipe them.
  try { await loadUserData(); } catch (e: any) { errorScreen(e.message ?? 'Check your connection and try again.'); return; }
  // sessions saved offline on this phone show up straight away, then upload in the background
  dropUploaded(new Set(state.sessions.map(s => s.id)));
  state.sessions.unshift(...queuedSessions());
  flushOutbox();
  syncPush();
  applyTheme();
  if (location.hash === '#reset') { $('#app').innerHTML = '<main id="auth"></main>'; renderAuth($('#auth'), 'reset'); return; }
  shell();
  const welcomed = await maybeWelcome();
  // opened from a phone notification: ?post=<id>#feed
  const post = new URLSearchParams(location.search).get('post');
  if (post) history.replaceState(null, '', location.pathname);
  if (post && UUID.test(post)) { focusPost(post); await go('feed'); }
  else await go('hang');
  if (!welcomed) setTimeout(maybeInstallNudge, 1500); // once per device, for people who've been here before
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
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// A tapped phone notification while the app is already open: jump to the post without reloading
// (go() refuses to leave a running or unsaved session, so nothing is lost).
navigator.serviceWorker?.addEventListener('message', e => {
  if (e.data?.type !== 'open-post' || !state.me) return;
  const id = new URL(e.data.url, location.href).searchParams.get('post') ?? '';
  if (UUID.test(id)) { if (!(current === 'hang' && hangBusy())) { focusPost(id); go('feed'); } else toast('Finish or cancel your session first'); }
});
// Re-draw Stats when offline sessions finish uploading.
document.addEventListener('bf:sessions-changed', () => { if (current === 'stats') renderStats($('#view-stats')); });
// Tap any climber's name or photo to open their profile.
document.addEventListener('click', e => {
  const el = (e.target as HTMLElement).closest('[data-uid]') as HTMLElement | null;
  if (el && !(e.target as HTMLElement).closest('button:not([data-uid]),input,a:not([data-uid])')) openClimber(el.dataset.uid!);
});
boot();
