import './styles.css';
import './app.css';
import { $, $$, toast } from './lib/ui';
import { ic, hydrateIcons, setIconMode } from './lib/icons';
import { state, initStore, loadUserData } from './lib/state';
import { setSound } from './lib/timer';
import { renderAuth } from './views/auth';
import { renderHang, hangBusy } from './views/hang';
import { renderFeed } from './views/feed';
import { renderRanks } from './views/ranks';
import { renderStats } from './views/stats';
import { renderProfile } from './views/profile';
import { maybeWelcome, pageTour } from './views/tour';
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
  pageTour(page);
}

function shell() {
  $('#app').innerHTML = `
    <header><img src="${import.meta.env.BASE_URL}logo.svg" alt="" width="30" height="30" class="logo"><h1>Bluies <span>Finest</span></h1></header>
    <main>${PAGES.map(p => `<div id="view-${p.id}" class="hide"></div>`).join('')}</main>
    <nav class="tabs" id="tabs" aria-label="Main">${PAGES.map(p => `<button data-v="${p.id}"><b>${ic(p.icon)}</b>${p.label}</button>`).join('')}</nav>`;
  hydrateIcons($('#tabs'));
  $$('#tabs button').forEach(b => b.addEventListener('click', () => go(b.dataset.v as Page)));
}

async function boot() {
  try { await initStore(); } catch (e: any) { $('#app').innerHTML = `<p class="sub center" style="padding:40px">Couldn't start: ${e.message}</p>`; return; }
  state.store.onAuthChange(() => location.reload());
  if (!state.store.currentUserId()) {
    applyTheme();
    $('#app').innerHTML = '<main id="auth"></main>';
    renderAuth($('#auth'), location.hash === '#reset' ? 'reset' : 'in');
    return;
  }
  try { await loadUserData(); } catch (e: any) { toast(e.message ?? 'Could not load your data', 5000); }
  applyTheme();
  if (location.hash === '#reset') { $('#app').innerHTML = '<main id="auth"></main>'; renderAuth($('#auth'), 'reset'); return; }
  shell();
  await maybeWelcome();
  await go('hang');
}

registerSW({ immediate: true });
boot();
