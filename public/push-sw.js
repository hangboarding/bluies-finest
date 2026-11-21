// Bluies Finest: push notification handlers, loaded into the generated
// service worker with workbox importScripts (see vite.config.ts).
/* eslint-env serviceworker */

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : '' }; }
  const scope = self.registration.scope;
  let url = new URL(data.url || '#feed', scope).href;
  if (!url.startsWith(scope)) url = new URL('#feed', scope).href; // only ever open our own app
  const title = data.title || 'Bluies Finest';
  event.waitUntil(Promise.all([
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: new URL('pwa-192x192.png', scope).href,
      badge: new URL('pwa-64x64.png', scope).href,
      tag: data.tag || undefined,
      renotify: !!data.tag,
      data: { url },
    }),
    Promise.resolve().then(() => self.navigator.setAppBadge?.()).catch(() => {}),
  ]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const scope = self.registration.scope;
  const url = (event.notification.data && event.notification.data.url) || new URL('#feed', scope).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins.find((c) => c.url.startsWith(scope)) || wins[0];
    if (win) {
      try {
        // Don't reload an open app (it could be mid-session) — ask it to show the post instead.
        win.postMessage({ type: 'open-post', url });
        await win.focus();
        return;
      } catch { /* fall through to openWindow */ }
    }
    await self.clients.openWindow(url);
  })());
});
