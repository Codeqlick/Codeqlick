/*
 * Service worker of cruising.codeqlick.com (architecture 4.15, decision 85): it only shows
 * Cruising's discreet notifications ("someone is at one of your favourite spots", "new message")
 * and opens the favourites or the messages when one is tapped. No caching.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === 'string' ? data.title : 'Cruising';
  const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === 'string' ? data.body : '',
      icon: '/favicon-192.png',
      badge: '/favicon-192.png',
      tag: typeof data.tag === 'string' ? data.tag : 'cruising',
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => client.url.startsWith(self.location.origin));
      if (open) return open.navigate(url).then((client) => (client ?? open).focus());
      return self.clients.openWindow(url);
    }),
  );
});
