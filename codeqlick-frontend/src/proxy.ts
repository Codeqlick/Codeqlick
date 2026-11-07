/**
 * Next.js 16 proxy (formerly middleware): next-intl locale routing + token refresh + route
 * protection for /{locale}/portal and /{locale}/admin. The refresh/forwarding mechanics are
 * documented and implemented in `src/lib/auth/refresh.ts`.
 */
import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './lib/auth/constants';
import {
  apiBaseUrl,
  clearTokenCookies,
  clientHeaders,
  isSecureCookieEnv,
  loginRedirectUrl,
  needsRefresh,
  protectedPathLocale,
  requestTokenRefresh,
  setTokenCookies,
  withForwardedRequestHeaders,
} from './lib/auth/refresh';

const handleI18nRouting = createMiddleware(routing);

export default async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const locale = protectedPathLocale(pathname);

  // Public pages: locale routing only.
  if (!locale) return handleI18nRouting(request);

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (accessToken && !needsRefresh(accessToken)) return handleI18nRouting(request);

  // An access token that is close to expiry but not expired yet is still usable as a fallback.
  const stillValid = Boolean(accessToken) && !needsRefresh(accessToken, Date.now() / 1000, 0);

  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) {
    if (stillValid) return handleI18nRouting(request);
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
    const response = NextResponse.redirect(loginRedirectUrl(request.url, locale, pathname, search));
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
