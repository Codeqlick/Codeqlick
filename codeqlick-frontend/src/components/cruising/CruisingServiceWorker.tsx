'use client';

import { useEffect } from 'react';

/** Cruising's service worker: notifications (decision 85), the offline page and app shell (96). */
export const CRUISING_SERVICE_WORKER = '/cruising-sw.js';

/**
 * Registers Cruising's service worker on its host, so the installed app opens an offline page
 * instead of the browser's error when there is no connection. Renders nothing. The same worker
 * shows notifications once the member turns them on (registering again is harmless).
 */
export function CruisingServiceWorker() {
  useEffect(() => {
    // Not in development: the cached build files would hide hot reloads.
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register(CRUISING_SERVICE_WORKER, { scope: '/' }).catch(() => {
      // Private windows and some browsers refuse it: the site works the same without it.
    });
  }, []);
  return null;
}
