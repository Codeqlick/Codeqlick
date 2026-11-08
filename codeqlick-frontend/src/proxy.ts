/**
 * Next.js 16 proxy (formerly middleware): web apps on their subdomains (`src/lib/webapps.ts`),
 * next-intl locale routing + token refresh + route protection for /{locale}/portal,
 * /{locale}/admin and /{locale}/videochat/room, and token refresh without protection for
 * /{locale}/meetings (guests welcome). The refresh/forwarding mechanics are
 * documented and implemented in `src/lib/auth/refresh.ts`.
 */
import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { routing } from './i18n/routing';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './lib/auth/constants';
import {
  apiBaseUrl,
  clearTokenCookies,
  clientHeaders,
  isOptionalSessionPath,
  isSecureCookieEnv,
  loginRedirectUrl,
  needsRefresh,
  protectedPathLocale,
  requestTokenRefresh,
  setTokenCookies,
  withForwardedRequestHeaders,
} from './lib/auth/refresh';
import { routeWebapp } from './lib/webapps';

const handleI18nRouting = createMiddleware(routing);

export default async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Behind Nginx the request URL says http://localhost; the Host header is the visitor's. When a
  // Server Action redirects, Next.js fetches the new page from itself with the visitor's host only
  // in X-Forwarded-Host (Nginx sets it, so visitors can't choose it).
  const host =
    request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ||
    request.headers.get('host') ||
    request.nextUrl.host;
  const protocol =
    request.headers.get('x-forwarded-proto') === 'https' ? 'https:' : request.nextUrl.protocol;
  // Old addresses are redirected only on navigations; images and form posts are just served. So
  // is a request Next.js sends itself (Host is the server's own): when it can't tell its address
  // is this one's, Next.js serves a rewrite by fetching the route from itself.
  const dest = request.headers.get('sec-fetch-dest');
  const navigation =
    request.method === 'GET' && dest !== 'image' && request.headers.get('host') === host;
  const webapp = routeWebapp(pathname, host, protocol, navigation);
  if (webapp.action === 'redirect') {
    const target = new URL(webapp.to, `${protocol}//${host}`);
    target.search = search;
    return NextResponse.redirect(target);
  }
  if (webapp.action === 'rewrite') {
    // On an app's host, /es/room is the route /es/videochat/room: the rest runs on the route.
    const url = request.nextUrl.clone();
    url.pathname = webapp.to;
    const routed = new NextRequest(url, request);
    return rewritten(await handle(routed), url, routed.headers);
  }
  return handle(request);
}

/**
 * Makes a response for a rewritten request serve its route: next-intl and the session code
 * answer "carry on", which would serve the browser's address; a redirect (to sign in) is kept.
 * Request headers they changed (a refreshed session's cookie) are carried over.
 */
function rewritten(response: NextResponse, url: URL, requestHeaders: Headers): NextResponse {
  if (response.headers.has('location') || response.headers.has('x-middleware-rewrite')) {
    return response;
  }
  const forwarded = new Headers(requestHeaders);
  const overridden = response.headers.get('x-middleware-override-headers');
  for (const name of overridden?.split(',') ?? []) {
    const key = name.trim().toLowerCase();
    const value = response.headers.get(`x-middleware-request-${key}`);
    if (!key) continue;
    if (value === null) forwarded.delete(key);
    else forwarded.set(key, value);
  }
  const result = NextResponse.rewrite(url, { request: { headers: forwarded } });
  response.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (
      lower === 'set-cookie' ||
      lower === 'x-middleware-next' ||
      lower === 'x-middleware-override-headers' ||
      lower.startsWith('x-middleware-request-')
    ) {
      return;
    }
    result.headers.set(key, value);
  });
  for (const cookie of response.cookies.getAll()) result.cookies.set(cookie);
  return result;
}

/** Locale routing, session refresh and protected pages for a request (its route's path). */
async function handle(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  const locale = protectedPathLocale(pathname);
  // Meetings take guests: an expiring session is refreshed, but nobody is sent to sign in.
  const optional = !locale && isOptionalSessionPath(pathname);

  // Public pages: locale routing only.
  if (!locale && !optional) return handleI18nRouting(request);

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (accessToken && !needsRefresh(accessToken)) return handleI18nRouting(request);

  // An access token that is close to expiry but not expired yet is still usable as a fallback.
  const stillValid = Boolean(accessToken) && !needsRefresh(accessToken, Date.now() / 1000, 0);

  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) {
    if (stillValid || !locale) return handleI18nRouting(request);
    return NextResponse.redirect(loginRedirectUrl(request.url, locale, pathname, search));
  }

  // Refresh FIRST, so the request seen by next-intl (and the render) already has the new token.
  // The visitor's IP and browser are recorded on the rotated session (the account's sessions list).
  const tokens = await requestTokenRefresh(
    apiBaseUrl(),
    refreshToken,
    clientHeaders(request.headers),
  );
  if (!tokens) {
    if (stillValid) return handleI18nRouting(request);
    const response = locale
      ? NextResponse.redirect(loginRedirectUrl(request.url, locale, pathname, search))
      : handleI18nRouting(request);
    clearTokenCookies(response);
    return response;
  }

  // RequestCookies writes through to request.headers ('cookie').
  request.cookies.set(ACCESS_COOKIE, tokens.accessToken);
  request.cookies.set(REFRESH_COOKIE, tokens.refreshToken);

  const intlResponse = handleI18nRouting(request);
  const response = withForwardedRequestHeaders(intlResponse, request.headers);
  setTokenCookies(response, tokens, isSecureCookieEnv());
  return response;
}

export const config = {
  // Everything except API routes, Next internals and files with an extension (favicon.ico, ...).
  matcher: ['/((?!api|site-draft|_next|_vercel|.*\\..*).*)'],
};
