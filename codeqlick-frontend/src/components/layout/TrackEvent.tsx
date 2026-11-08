'use client';

import { useEffect } from 'react';

/**
 * Counts one analytics event when it is shown (a request sent, a purchase paid), once per page
 * load. The tracker loads deferred, so it waits for it a few seconds; without analytics (not set
 * up, or "Do Not Track") nothing happens.
 */
export function TrackEvent({ event, data }: { event: string; data?: Record<string, string> }) {
  const payload = JSON.stringify(data ?? {});
  useEffect(() => {
    const attempts = { count: 0 };
    const timer = setInterval(() => {
      attempts.count += 1;
      if (window.umami) {
        window.umami.track(event, JSON.parse(payload) as Record<string, string>);
        clearInterval(timer);
      } else if (attempts.count >= 20) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [event, payload]);
  return null;
}
