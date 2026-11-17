/**
 * Next.js 16 proxy (formerly middleware): web apps on their subdomains (`src/lib/webapps.ts`),
 * next-intl locale routing + token refresh + route protection for /{locale}/portal,
 * /{locale}/admin, and token refresh without protection for
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
import {
  accountHostFor,
  isAccountHost,
  isIpHost,
  mainHostOf,
  routeAccount,
} from './lib/account-host';
import { cspHeaders, makeNonce, type CspContext } from './lib/security-headers';
import { SSO_COOKIE_MAX_AGE, routeSignIn, ssoClientForHost, startSso } from './lib/sso';
import { WEBAPPS, routeWebapp, webappForHost, webappHost } from './lib/webapps';

const i18nRouting = createMiddleware(routing);

/** The visitor's host and protocol (behind Nginx the request URL says http://localhost). */
function visitorAddress(request: NextRequest): { host: string; protocol: string } {
  // When a Server Action redirects, Next.js fetches the new page from itself with the visitor's
  // host only in X-Forwarded-Host (Nginx sets it, so visitors can't choose it).
  const host =
    request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ||
    request.headers.get('host') ||
    request.nextUrl.host;
  const protocol =
    request.headers.get('x-forwarded-proto') === 'https' ? 'https:' : request.nextUrl.protocol;
  return { host, protocol };
}

export default async function proxy(request: NextRequest) {
  // The Content Security Policy needs a fresh nonce per response (architecture 6.4); `next dev`
  // runs without one (it needs eval and its own socket).
  if (process.env.NODE_ENV !== 'production') return route(request);
  const nonce = makeNonce();
  const context = cspContext(request);
  const response = await route(request);
  return withCsp(response, request.headers, context, nonce);
}

/** Where this request's page may send forms and open sockets, by its host. */
function cspContext(request: NextRequest): CspContext {
  const { host, protocol } = visitorAddress(request);
  // The account host (decision 108) is its own kind: named `account` like an app's first label.
  const app = isAccountHost(host) ? 'account' : webappForHost(host);
  const mainHost = mainHostOf(host);
  const sockets = [process.env.MEETINGS_WS_URL].flatMap((url) => {
    try {
      return url ? [new URL(url).origin] : [];
    } catch {
      return [];
    }
  });
  return {
    app,
    origin: `${protocol}//${host}`,
    // Single sign-on sends forms on between the account host and every client host.
    siteOrigins: [
      mainHost,
      accountHostFor(host),
      ...WEBAPPS.map((name) => webappHost(name, mainHost)),
    ].map((name) => `${protocol}//${name}`),
    sockets,
  };
}

/**
 * Adds the policy to the response and hands the nonce to the render: Next.js reads it from the
 * request's `Content-Security-Policy` (its own scripts) and the layouts from `x-nonce`. Request
 * headers reach the render only through the override list, so the nonce joins the list the
 * response already has (a refreshed session's cookie, a rewrite) or one made of every header.
 */
function withCsp(
  response: NextResponse,
  incoming: Headers,
  context: CspContext,
  nonce: string,
): NextResponse {
  const enforce = process.env.CSP_ENFORCE === 'true';
  const headers = cspHeaders(context, nonce, enforce);
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  if (response.headers.has('location')) return response;

  const listed = response.headers.get(OVERRIDE_HEADERS);
  const names = listed ? listed.split(',').map((name) => name.trim().toLowerCase()) : [];
  if (!listed) {
    incoming.forEach((value, name) => {
      names.push(name);
      response.headers.set(`${REQUEST_HEADER_PREFIX}${name}`, value);
    });
  }
  const forwarded: Record<string, string> = {
    'content-security-policy':
      headers['Content-Security-Policy-Report-Only'] ?? headers['Content-Security-Policy']!,
    'x-nonce': nonce,
  };
  for (const [name, value] of Object.entries(forwarded)) {
    response.headers.set(`${REQUEST_HEADER_PREFIX}${name}`, value);
    if (!names.includes(name)) names.push(name);
  }
  response.headers.set(OVERRIDE_HEADERS, names.filter(Boolean).join(','));
  return response;
}

/** Whether a request is the router prefetching a page (`Link` in view), not someone opening it. */
function isPrefetch(headers: Headers): boolean {
  return (
    headers.has('next-router-prefetch') ||
    headers.get('sec-purpose')?.includes('prefetch') === true ||
    headers.get('purpose') === 'prefetch'
  );
}

const OVERRIDE_HEADERS = 'x-middleware-override-headers';
const REQUEST_HEADER_PREFIX = 'x-middleware-request-';

/** Web apps' hosts, locale redirects, then locale routing and the session (`handle`). */
async function route(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  const { host, protocol } = visitorAddress(request);
  // Old addresses are redirected only on navigations; images and form posts are just served. So
  // is a request Next.js sends itself (Host is the server's own): when it can't tell its address
  // is this one's, Next.js serves a rewrite by fetching the route from itself.
  const dest = request.headers.get('sec-fetch-dest');
  const navigation =
    request.method === 'GET' && dest !== 'image' && request.headers.get('host') === host;
  // Single sign-on (decision 108): signing in, up and recovering an account happen on the
  // account host; every other host starts the flow or sends the page there. Staging has no
  // account host and turns it off (ACCOUNT_SSO=false).
  const sso = process.env.ACCOUNT_SSO !== 'false' && !isIpHost(host);
  if (sso && request.method === 'GET') {
    const signIn = routeSignIn(pathname, request.nextUrl.searchParams, host, protocol);
    // A `Link`'s prefetch of a sign-in address: nothing to prefetch (the page lives on the
    // account host), and a cross-origin redirect would only make the router try again and again.
    // Clicking it is a real navigation, which starts the flow.
    if (signIn.action !== 'pass' && isPrefetch(request.headers)) {
      return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
    }
    if (signIn.action === 'redirect') return NextResponse.redirect(signIn.to);
    const client = ssoClientForHost(host);
    if (signIn.action === 'start' && client) {
      const flow = await startSso({ client, host, protocol, ...signIn });
      const response = NextResponse.redirect(flow.url);
      response.cookies.set(flow.cookie.name, flow.cookie.value, {
        httpOnly: true,
        secure: isSecureCookieEnv(),
        sameSite: 'lax',
        path: '/',
        maxAge: SSO_COOKIE_MAX_AGE,
      });
      return response;
    }
  }

  const webapp =
    sso && isAccountHost(host)
      ? routeAccount(pathname, host, protocol, navigation)
      : routeWebapp(pathname, host, protocol, navigation);
  if (webapp.action === 'redirect') {
    const target = new URL(webapp.to, `${protocol}//${host}`);
    target.search = search;
    return NextResponse.redirect(target);
  }
  if (webapp.action === 'rewrite') {
    // On an app's host, /es/room is the route /es/meetings/room (on the account host, /es/security
    // is /es/account/security): the rest runs on the route.
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
  if (!locale && !optional) return i18nRouting(request);

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (accessToken && !needsRefresh(accessToken)) return i18nRouting(request);

  // An access token that is close to expiry but not expired yet is still usable as a fallback.
  const stillValid = Boolean(accessToken) && !needsRefresh(accessToken, Date.now() / 1000, 0);

  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) {
    if (stillValid || !locale) return i18nRouting(request);
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
    if (stillValid) return i18nRouting(request);
    const response = locale
      ? NextResponse.redirect(loginRedirectUrl(request.url, locale, pathname, search))
      : i18nRouting(request);
    clearTokenCookies(response);
    return response;
  }

  // RequestCookies writes through to request.headers ('cookie').
  request.cookies.set(ACCESS_COOKIE, tokens.accessToken);
  request.cookies.set(REFRESH_COOKIE, tokens.refreshToken);

  const intlResponse = i18nRouting(request);
  const response = withForwardedRequestHeaders(intlResponse, request.headers);
  setTokenCookies(response, tokens, isSecureCookieEnv());
  return response;
}

export const config = {
  // Everything except API routes, Next internals and files with an extension (favicon.ico, ...).
  matcher: ['/((?!api|site-draft|_next|_vercel|.*\\..*).*)'],
};
