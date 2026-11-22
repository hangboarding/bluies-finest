// In-app notifications: hearts and comments other climbers leave on my sessions.
// A bell in the header shows the unread count; the list opens in a sheet.
import { $, esc, avatar, relTime, sheet, closeSheet } from '../lib/ui';
import { ic, hydrateIcons } from '../lib/icons';
import { state, saveSettings } from '../lib/state';
import type { Notif } from '../lib/types';
import { openAdmin } from './admin';

let items: Notif[] = [];
let loading = false;

const seenAt = () => (state.settings as any).notifSeen as string | undefined;
export const unread = () => items.filter(n => !seenAt() || n.createdAt > seenAt()!).length;

function paintBadge() {
  const n = unread(), b = $('#bellCount');
  if (b) { b.textContent = n > 9 ? '9+' : String(n); b.classList.toggle('hide', n === 0); }
  $('#bell')?.setAttribute('aria-label', n ? `Notifications, ${n} new` : 'Notifications');
  // home-screen icon badge where supported (installed app on iOS 16.4+, Android Chrome, desktop)
  try { n ? (navigator as any).setAppBadge?.(n) : (navigator as any).clearAppBadge?.(); } catch { /* unsupported */ }
}

export async function refreshNotifs() {
  if (loading || !state.store?.currentUserId() || !navigator.onLine) return;
  loading = true;
  try {
    items = await state.store.notifications(40);
    // first ever load: don't flood a new user with old activity — but do start the clock even if there's none yet
    if (!seenAt()) { (state.settings as any).notifSeen = items[0]?.createdAt ?? new Date().toISOString(); saveSettings(); }
    paintBadge();
  } catch { /* offline or not set up — try again later */ }
  finally { loading = false; }
}

export function bellHtml() {
  return `<button class="bell" id="bell" aria-label="Notifications">${ic('bell')}<span class="bell-n hide" id="bellCount"></span></button>`;
}

export function wireBell(goToFeed: (sessionId: string) => void) {
  let opening = false;
  $('#bell')?.addEventListener('click', async () => {
    if (opening || document.querySelector('.nlist')) return; // ignore double taps
    opening = true;
    try { await openList(); } finally { opening = false; }
  });
  const openList = async () => {
    await refreshNotifs();
    const since = seenAt();
    const rows = items.map(n => {
      const p = state.profiles.get(n.fromUserId), isNew = !since || n.createdAt > since;
      if (n.kind === 'issue') return `<button class="nrow ${isNew ? 'new' : ''}" data-issue="${n.sessionId}">${avatar(p)}<span><b>${esc(p?.name ?? 'Someone')}</b> ${ic('bug')} reported an issue: “${esc((n.body ?? '').slice(0, 80))}”<small>${relTime(n.createdAt)}</small></span></button>`;
      const what = n.kind === 'like'
        ? `${ic('hearted')} hearted your <b>${esc(n.protocolName)}</b>`
        : `${ic('comment')} commented on your <b>${esc(n.protocolName)}</b>: “${esc((n.body ?? '').slice(0, 80))}”`;
      return `<button class="nrow ${isNew ? 'new' : ''}" data-sid="${n.sessionId}">${avatar(p)}<span><b>${esc(p?.name ?? 'Someone')}</b> ${what}<small>${relTime(n.createdAt)}</small></span></button>`;
    }).join('');
    // mark everything as seen once the list is opened
    if (items.length) { (state.settings as any).notifSeen = items[0]!.createdAt; saveSettings(); }
    paintBadge();
    let el!: HTMLElement;
    const done = sheet({ title: 'Notifications', body: `<div class="nlist">${rows || '<p class="sub">Nothing yet. When someone hearts or comments on your sessions, it shows up here.</p>'}</div>`, onMount: e => { el = e; } });
    hydrateIcons(el);
    el.addEventListener('click', e => {
      const r = (e.target as HTMLElement).closest('.nrow') as HTMLElement | null; if (!r) return;
      closeSheet(el);
      if (r.dataset.issue) openAdmin(); else goToFeed(r.dataset.sid!);
    });
    await done;
  };
  refreshNotifs();
}

// keep it fresh without hammering the server
setInterval(() => { if (!document.hidden) refreshNotifs(); }, 2 * 60e3);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshNotifs(); });
