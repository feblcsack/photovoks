/**
 * Kill-switch service worker.
 *
 * Earlier versions of Photovoks registered a cache-first service worker that
 * served the old booth UI from cache. This replacement clears every cache,
 * unregisters itself and reloads open tabs so devices pick up the current app.
 * (The current app does not register a service worker.)
 */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((c) => c.navigate(c.url));
    })(),
  );
});
