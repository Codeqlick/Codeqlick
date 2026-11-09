import type { Instrumentation } from 'next';
import { isExpectedServerError, pathOnly } from '@/lib/error-report';

/**
 * Next.js calls this for every error thrown while rendering, in a Server Action or a route
 * handler: production reports it to Admin → Errors (architecture 4.11). Plain fetch on purpose:
 * this runs outside a request's scope, and a failed report must never throw.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request) => {
  if (process.env.NODE_ENV !== 'production' || isExpectedServerError(error)) return;
  const err = error instanceof Error ? error : new Error(String(error));
  const header = (name: string) => {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0] : value;
  };
  const ip = header('x-real-ip') || header('x-forwarded-for')?.split(',').at(-1)?.trim();
  const apiUrl = process.env.API_URL ?? 'http://localhost:4000/v1';
  try {
    await fetch(`${apiUrl}/errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(ip ? { 'X-Forwarded-For': ip } : {}) },
      body: JSON.stringify({
        source: 'server',
        message: `${err.name}: ${err.message}`.slice(0, 2000),
        stack: err.stack?.slice(0, 20_000),
        method: request.method.slice(0, 10),
        path: pathOnly(request.path).slice(0, 2000),
        digest: (err as { digest?: unknown }).digest?.toString().slice(0, 100),
        userAgent: header('user-agent')?.slice(0, 1000),
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // The API is down or slow: the server monitor alerts on that.
  }
};
