// Phone push notifications (Web Push). Client helpers only, no UI.
// Server side: supabase/push.sql (subscriptions table) and supabase/functions/notify.
// Setup guide: docs/PUSH.md.
import type { SupabaseClient } from '@supabase/supabase-js';
import { state } from './state';

export type PushSupport = 'ok' | 'ios-install' | 'unsupported' | 'demo';

const VAPID_KEY = ((import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? '').trim();

function client(): SupabaseClient | null {
  return ((state.store as any)?.client as SupabaseClient | undefined) ?? null;
}

function isIOS(): boolean {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac, so also check for touch.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
}

/**
 * Whether push can be turned on here:
 * - 'demo': no Supabase backend or no VAPID key in this build
 * - 'ios-install': iPhone/iPad in the browser; must Add to Home Screen first (iOS 16.4+)
 * - 'unsupported': this browser has no Web Push
 * - 'ok': ready, call enablePush() from a tap
 */
export function pushSupport(): PushSupport {
  if (!client() || !VAPID_KEY) return 'demo';
  const hasApis = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (isIOS() && !isStandalone()) return 'ios-install';
  return hasApis ? 'ok' : 'unsupported';
}

function base64UrlToBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob((b64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function sameKey(sub: PushSubscription): boolean {
  const k = sub.options?.applicationServerKey;
  if (!k) return true; // browser doesn't expose it; assume fine
  const a = new Uint8Array(k), b = base64UrlToBytes(VAPID_KEY);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('The app is still installing its offline files. Try again in a few seconds.')), 10_000));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

async function subscribe(reg: ServiceWorkerRegistration): Promise<PushSubscription> {
  try {
    return await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(VAPID_KEY) });
  } catch (e) {
    if (Notification.permission === 'denied') throw blocked();
    throw new Error(`Couldn't turn on notifications on this device (${(e as Error)?.message || e}).`);
  }
}

const blocked = () => new Error("Notifications are blocked. Allow them in your phone's settings for this app, then try again.");

/** Save the subscription for the signed-in user. Returns false if the endpoint belongs to another account. */
async function save(sub: PushSubscription): Promise<boolean> {
  const c = client();
  if (!c) throw new Error('Notifications need the online version of the app.');
  const j = sub.toJSON();
  if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) throw new Error('This browser gave an incomplete push subscription.');
  const { error } = await c.from('push_subscriptions').upsert(
    { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 300) },
    { onConflict: 'endpoint' },
  );
  if (!error) return true;
  // Row-level security refused: this device's endpoint is still registered to someone who signed out here.
  if (error.code === '42501') return false;
  throw new Error(`Couldn't save notification settings: ${error.message}`);
}

/** Subscribe (or reuse the existing subscription) and store it; resubscribes if the endpoint is taken. */
async function subscribeAndSave(reg: ServiceWorkerRegistration): Promise<void> {
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub)) { await sub.unsubscribe().catch(() => {}); sub = null; }
  if (!sub) sub = await subscribe(reg);
  if (await save(sub)) return;
  await sub.unsubscribe().catch(() => {});
  if (!(await save(await subscribe(reg)))) throw new Error("Couldn't register this device for notifications. Try again later.");
}

/** True when this device has an active push subscription and permission is granted. */
export async function pushEnabled(): Promise<boolean> {
  if (pushSupport() !== 'ok' || Notification.permission !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return !!(await reg?.pushManager.getSubscription());
  } catch { return false; }
}

/** Ask for permission and subscribe this device. Must be called from a user tap. Throws friendly Errors. */
export async function enablePush(): Promise<void> {
  const support = pushSupport();
  if (support === 'demo') throw new Error('Notifications aren\'t set up for this app yet.');
  if (support === 'ios-install') throw new Error('On iPhone, first add the app to your Home Screen (Share → Add to Home Screen), then open it from there.');
  if (support === 'unsupported') throw new Error('This browser doesn\'t support notifications. Try Chrome, or install the app to your home screen.');
  if (!state.me) throw new Error('Sign in to turn on notifications.');
  if (Notification.permission === 'denied') throw blocked();
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (perm !== 'granted') throw perm === 'denied' ? blocked() : new Error('Notifications weren\'t allowed. Tap again and choose Allow.');
  await subscribeAndSave(await registration());
}

/** Unsubscribe this device and remove it from the server. */
export async function disablePush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const c = client();
  if (c) {
    const { error } = await c.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    if (error) console.warn('Could not remove push subscription:', error.message);
  }
  await sub.unsubscribe();
}

/**
 * Call once after sign-in on app start. If permission is already granted, make sure the
 * current subscription (endpoints can rotate) is stored for this user. Never prompts; never throws.
 */
export async function syncPush(): Promise<void> {
  try {
    if (pushSupport() !== 'ok' || !state.me || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg || !(await reg.pushManager.getSubscription())) return; // user hasn't turned it on here
    await subscribeAndSave(reg);
  } catch (e) {
    console.warn('Push sync failed:', e);
  }
}
