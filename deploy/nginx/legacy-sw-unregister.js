// Served with a 200 by the old <app>.codeqlick.com hosts at /cruising-sw.js, /swipe-sw.js and
// /videochat-sw.js (architecture 4.18, decision 130; deploy/neoqlick-cutover.sh). Browsers refuse a
// redirect for a service worker script, so an installed worker of the old origin could never reach
// the new host. This script replaces it, clears the caches, unregisters itself and reloads the open
// pages, which the redirect then sends to the new host.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      } catch {
        // No caches to clear.
      }
      await self.registration.unregister();
      const windows = await self.clients.matchAll({ type: 'window' });
      for (const client of windows) {
        client.navigate(client.url).catch(() => {});
      }
    })(),
  );
});
