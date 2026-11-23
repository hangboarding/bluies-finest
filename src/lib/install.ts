// "Add to home screen". Android and desktop Chrome/Edge hand us an install prompt
// (beforeinstallprompt) that a button can trigger. iPhone/iPad Safari has no such API, so
// there we show the two taps it takes. Already installed (opened from the home screen) → no button.
import { sheet } from './ui';

interface InstallPrompt extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>; }
let deferred: InstallPrompt | null = null;
const NUDGED = 'bf.installNudged';

addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); // keep the browser's own mini-bar away; our button shows it instead
  deferred = e as InstallPrompt;
  document.dispatchEvent(new Event('bf:installable'));
});
addEventListener('appinstalled', () => { deferred = null; remember(); document.dispatchEvent(new Event('bf:installable')); });

const remember = () => { try { localStorage.setItem(NUDGED, '1'); } catch { /* private mode */ } };
const nudged = () => { try { return localStorage.getItem(NUDGED) === '1'; } catch { return true; } };

export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
/** Worth showing an "Add to home screen" button: not installed, and we can either prompt or explain. */
export const canInstall = () => !isStandalone() && (!!deferred || isIOS());

/** Install now (Android/desktop), or show the steps (iPhone/iPad). */
export async function install(): Promise<boolean> {
  remember();
  if (deferred) {
    const d = deferred; deferred = null;
    await d.prompt();
    const { outcome } = await d.userChoice;
    document.dispatchEvent(new Event('bf:installable'));
    return outcome === 'accepted';
  }
  await sheet({
    title: 'Add to your home screen',
    body: `<ol class="installsteps">
      <li>Tap the <b>Share</b> button <svg class="shareic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> in Safari's toolbar.</li>
      <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
      <li>Tap <b>Add</b>. Bluies Finest opens full screen, like an app.</li></ol>
      <p class="sub" style="font-size:12px">Using Chrome on iPhone? It's the Share button next to the address bar.</p>`,
    buttons: [{ label: 'Got it', kind: 'primary' }],
  });
  return false;
}

/** The welcome tour's button (empty when there's nothing to offer). */
export const installButton = () => canInstall() ? `<button type="button" class="big installbtn" data-a="install">📲 Add to home screen</button>` : '';

/** Existing users: suggest it once per device, on a quiet moment after the app has loaded. */
export async function maybeInstallNudge() {
  if (isStandalone() || nudged()) return;
  // Chrome/Edge decide a moment after load whether the app can be installed
  if (!isIOS() && !deferred) await new Promise<void>(res => {
    const done = () => { document.removeEventListener('bf:installable', done); res(); };
    document.addEventListener('bf:installable', done); setTimeout(done, 4000);
  });
  if (!canInstall() || document.querySelector('.modal, .tour')) return; // something else is on screen: try next time
  remember();
  const i = await sheet({
    title: '📲 Add Bluies Finest to your home screen',
    body: `<p class="sub">It opens full screen like an app, works with no signal, and it's one tap away when you're at the board.</p>`,
    buttons: [{ label: 'Not now', kind: 'ghost' }, { label: 'Add it', kind: 'primary' }],
  });
  if (i === 1) await install();
}
