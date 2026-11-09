'use client';

import { useEffect } from 'react';
import { isBrowserNoise } from '@/lib/error-report';
import { reportBrowserErrorAction } from '@/lib/error-report-action';

/** At most this many reports per page load: a loop must not flood the API. */
const MAX_REPORTS = 5;
let sent = 0;

/**
 * Sends a browser error to Admin → Errors (architecture 4.11). Errors with a digest came from the
 * server, which reported them already; noise (extensions, ads, the network) is left out.
 */
export function reportBrowserError(error: unknown): void {
  if (process.env.NODE_ENV !== 'production' || sent >= MAX_REPORTS) return;
  if (error && typeof error === 'object' && 'digest' in error && error.digest) return;
  const err = error instanceof Error ? error : new Error(String(error));
  const message = `${err.name}: ${err.message}`;
  if (isBrowserNoise(message, err.stack)) return;
  sent += 1;
  void reportBrowserErrorAction({
    message: message.slice(0, 2000),
    stack: err.stack?.slice(0, 20_000),
    path: window.location.pathname,
  }).catch(() => undefined);
}

/** Listens for the errors no error boundary catches (event handlers, promises). Renders nothing. */
export function ErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      // A failed <img> or <script> fires an `error` event without an Error.
      if (event.error) reportBrowserError(event.error);
    };
    const onRejection = (event: PromiseRejectionEvent) => reportBrowserError(event.reason);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  return null;
}
