/*
 * Service worker of cruising.neoqlick.com (architecture 4.15, 4.18).
 * - Decision 85: it shows Cruising's discreet notifications ("someone is at one of your favourite
 *   spots", "new message") and opens the favourites or the messages when one is tapped.
 * - Decision 96: it keeps an offline page ("You're offline") and the app shell (the icons and the
 *   build's static files, which never change under the same name), so the installed app opens
 *   something useful without a connection. Pages, the API, the BFF routes and members' photos are
 *   never cached: they are personal or change all the time.
 */
const CACHE = 'neoqlick-cruising-shell-v1';
const OFFLINE_URL = '/cruising-offline.html';
const SHELL = [
  OFFLINE_URL,
  '/neoqlick/png/favicon-192.png',
  '/neoqlick/png/favicon-512.png',
  '/neoqlick/svg/favicon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => (name.startsWith('cruising-') || name.startsWith('neoqlick-cruising-')) && name !== CACHE)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** The build's files (`/_next/static/…`, named by their content) and the shell's own. */
function isShellAsset(url) {
  return url.pathname.startsWith('/_next/static/') || SHELL.includes(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // A page: always from the network; without one, the offline page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((offline) => offline ?? Response.error()),
      ),
    );
    return;
  }

  // The app shell: from the cache, fetched (and kept) the first time.
  if (isShellAsset(url)) {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(request).then(
          (hit) =>
            hit ??
            fetch(request).then((response) => {
              if (response.ok) cache.put(request, response.clone());
              return response;
            }),
        ),
      ),
    );
  }
});

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
      icon: '/neoqlick/png/favicon-192.png',
      badge: '/neoqlick/png/favicon-192.png',
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
