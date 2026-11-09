/**
 * Which errors are worth a row in Admin → Errors (architecture 4.11). Pure functions shared by
 * the server hook (instrumentation.ts) and the browser reporter; no `server-only`.
 */

/** Browser noise nobody can fix: extensions, cross-origin scripts (ads), benign browser quirks. */
const BROWSER_NOISE = [
  /^Script error\.?$/i,
  /ResizeObserver loop/i,
  /chrome-extension:\/\//,
  /moz-extension:\/\//,
  /safari-(web-)?extension:\/\//,
  /Non-Error promise rejection captured/i,
  // A new release while the tab was open: the next navigation loads it.
  /Loading chunk [\w-]+ failed/i,
  /ChunkLoadError/,
  // The visitor's connection, not the code.
  /^(TypeError: )?(Failed to fetch|NetworkError when attempting to fetch resource\.|Load failed)$/i,
  /AbortError/,
];

export function isBrowserNoise(message: string, stack?: string): boolean {
  return BROWSER_NOISE.some(
    (pattern) => pattern.test(message.trim()) || (stack ? pattern.test(stack) : false),
  );
}

/**
 * Server errors Next.js reports that are not bugs: an API answer the page didn't handle that the
 * visitor caused (4xx), or the API being down (503, which the server monitor already alerts on).
 */
export function isExpectedServerError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { name, status } = error as { name?: unknown; status?: unknown };
  return name === 'ApiError' && typeof status === 'number' && (status < 500 || status === 503);
}

/** The path without query string or fragment (they may carry tokens). */
export function pathOnly(path: string): string {
  return path.replace(/[?#].*$/, '');
}
