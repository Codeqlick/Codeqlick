/**
 * Pure, framework-light helpers used by `src/proxy.ts` to keep sessions alive.
 *
 * No `server-only` import here on purpose: the proxy is bundled separately from the React server
 * graph, so this module (and `constants.ts`) only depend on `next/server` and Web APIs. Everything
 * except `withForwardedRequestHeaders` is a plain function that can be unit tested without Next.
 *
 * How the proxy refresh works (see architecture 4.3 and 6.2):
 *
 * 1. next-intl does locale routing for every request.
 * 2. For /{locale}/portal/** and /{locale}/admin/**:
 *    - a usable `cq_at` (present and not about to expire) → nothing else to do;
 *    - otherwise, if `cq_rt` exists, the proxy calls POST {API_URL}/auth/refresh FIRST, before
 *      running next-intl, and writes the new tokens into `request.cookies`. NextRequest's cookie
 *      jar writes through to `request.headers`, so next-intl forwards the updated `cookie` header;
 *    - then `withForwardedRequestHeaders` rebuilds next-intl's `next`/`rewrite` response with
 *      `{ request: { headers } }` so the *same* render (layouts calling `getCurrentUser()`) sees the
 *      new access token, copying every other header and cookie next-intl set;
 *    - redirects from next-intl are kept as-is: the browser follows them carrying the new cookies;
 *    - the new tokens are always set on the outgoing response with `Set-Cookie`;
 *    - if there is no refresh token or the refresh fails → redirect to /{locale}/login?next=<path>.
 * 3. Role checks are NOT done here; they live in the portal/admin layouts (`requireRole`).
 */
import { NextResponse } from 'next/server';
import { ACCESS_COOKIE, PROTECTED_PATH, REFRESH_COOKIE, REFRESH_TOKEN_MAX_AGE } from './constants';

export type RefreshedTokens = { accessToken: string; refreshToken: string; expiresIn: number };

export type AuthCookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
};

/** Cookie attributes from architecture 6.2. */
export function authCookieOptions(maxAge: number, secure: boolean): AuthCookieOptions {
  return { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: Math.max(0, Math.floor(maxAge)) };
}

export function accessCookieOptions(expiresIn: number, secure: boolean) {
  return authCookieOptions(expiresIn, secure);
}

export function refreshCookieOptions(secure: boolean) {
  return authCookieOptions(REFRESH_TOKEN_MAX_AGE, secure);
}

export function isSecureCookieEnv(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** API base URL without trailing slash. Read directly from process.env (no server-only import). */
export function apiBaseUrl(): string {
  const raw = process.env.API_URL || 'http://localhost:4000/v1';
  return raw.replace(/\/+$/, '');
}

/** Returns the locale of a protected path (`/es/admin/leads` → `es`), or null. */
export function protectedPathLocale(pathname: string): 'en' | 'es' | null {
  const match = PROTECTED_PATH.exec(pathname);
  if (!match) return null;
  return match[1] === 'es' ? 'es' : 'en';
}

/**
 * Reads the `exp` claim (seconds since epoch) of a JWT without verifying it.
 * Verification is the API's job; we only use this to refresh slightly before expiry.
 */
export function jwtExpiry(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload: unknown = JSON.parse(atob(padded));
    if (payload && typeof payload === 'object' && 'exp' in payload) {
      const exp = (payload as { exp: unknown }).exp;
      return typeof exp === 'number' ? exp : null;
    }
  } catch {
    return null;
  }
  return null;
}

/** True when the token is missing, or its `exp` is within `skewSeconds` of `nowSeconds`. */
export function needsRefresh(
  accessToken: string | undefined,
  nowSeconds: number = Date.now() / 1000,
  skewSeconds = 30,
): boolean {
  if (!accessToken) return true;
  const exp = jwtExpiry(accessToken);
  // Opaque or malformed tokens: trust the cookie max-age and let the API decide.
  if (exp === null) return false;
  return exp - skewSeconds <= nowSeconds;
}

/** Builds /{locale}/login?next=<path+search> as an absolute URL for NextResponse.redirect. */
export function loginRedirectUrl(
  requestUrl: string,
  locale: string,
  pathname: string,
  search = '',
): URL {
  const url = new URL(`/${locale}/login`, requestUrl);
  url.searchParams.set('next', `${pathname}${search}`);
  return url;
}

/** Narrow unknown JSON to the subset of AuthTokens the proxy needs. */
export function parseTokens(data: unknown): RefreshedTokens | null {
  if (!data || typeof data !== 'object') return null;
  const { accessToken, refreshToken, expiresIn } = data as Record<string, unknown>;
  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') return null;
  return {
    accessToken,
    refreshToken,
    expiresIn: typeof expiresIn === 'number' && expiresIn > 0 ? expiresIn : 900,
  };
}

/** POST {apiUrl}/auth/refresh. Returns null on any failure (network, 4xx, 5xx, bad body). */
export async function requestTokenRefresh(
  apiUrl: string,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RefreshedTokens | null> {
  try {
    const response = await fetchImpl(`${apiUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return parseTokens(await response.json());
  } catch {
    return null;
  }
}

/** Serializes a cookie map into a `Cookie` request header value. */
export function serializeCookieHeader(cookies: Iterable<{ name: string; value: string }>): string {
  return Array.from(cookies, ({ name, value }) => `${name}=${encodeURIComponent(value)}`).join(
    '; ',
  );
}

/** Writes refreshed tokens on an outgoing response. */
export function setTokenCookies(response: NextResponse, tokens: RefreshedTokens, secure: boolean) {
  response.cookies.set(ACCESS_COOKIE, tokens.accessToken, accessCookieOptions(tokens.expiresIn, secure));
  response.cookies.set(REFRESH_COOKIE, tokens.refreshToken, refreshCookieOptions(secure));
}

export function clearTokenCookies(response: NextResponse) {
  response.cookies.delete(ACCESS_COOKIE);
  response.cookies.delete(REFRESH_COOKIE);
}

const OVERRIDE_HEADERS = 'x-middleware-override-headers';
const REQUEST_HEADER_PREFIX = 'x-middleware-request-';

/** True for 3xx responses with a Location header (next-intl locale redirects). */
export function isRedirectResponse(response: Response): boolean {
  return response.status >= 300 && response.status < 400 && response.headers.has('location');
}

/**
 * Rebuilds a next-intl response so the current render receives `requestHeaders` (which carry the
 * refreshed `cookie` header), preserving everything next-intl did:
 *
 * - request headers next-intl itself forwarded (`x-middleware-request-*`) are merged in first;
 * - a rewrite stays a rewrite to the same URL, otherwise it becomes `NextResponse.next`;
 * - every other response header (e.g. `link`, `x-middleware-*` bookkeeping not related to request
 *   overrides) and every cookie next-intl set (e.g. NEXT_LOCALE) are copied over.
 *
 * Redirects are returned untouched (the browser makes a new request with the new cookies).
 */
export function withForwardedRequestHeaders(
  intlResponse: NextResponse,
  requestHeaders: Headers,
): NextResponse {
  if (isRedirectResponse(intlResponse)) return intlResponse;

  const forwarded = new Headers(requestHeaders);
  const overridden = intlResponse.headers.get(OVERRIDE_HEADERS);
  if (overridden) {
    for (const name of overridden.split(',')) {
      const key = name.trim().toLowerCase();
      if (!key || key === 'cookie') continue; // our refreshed cookie header wins
      const value = intlResponse.headers.get(`${REQUEST_HEADER_PREFIX}${key}`);
      if (value !== null) forwarded.set(key, value);
    }
  }

  const rewriteTarget = intlResponse.headers.get('x-middleware-rewrite');
  const response = rewriteTarget
    ? NextResponse.rewrite(rewriteTarget, { request: { headers: forwarded } })
    : NextResponse.next({ request: { headers: forwarded } });

  intlResponse.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (
      lower === 'set-cookie' ||
      lower === OVERRIDE_HEADERS ||
      lower.startsWith(REQUEST_HEADER_PREFIX) ||
      lower === 'x-middleware-next' ||
      lower === 'x-middleware-rewrite'
    ) {
      return;
    }
    response.headers.set(key, value);
  });

  for (const cookie of intlResponse.cookies.getAll()) {
    response.cookies.set(cookie);
  }

  return response;
}
