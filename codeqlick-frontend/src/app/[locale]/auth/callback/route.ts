import { hasLocale } from 'next-intl';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from '@/i18n/routing';
import { exchangeSsoCode } from '@/lib/api/auth';
import type { AuthTokens } from '@/lib/api/types';
import { isSecureCookieEnv, setTokenCookies } from '@/lib/auth/refresh';
import {
  decodeSsoCookie,
  isValidCode,
  isValidState,
  landingPath,
  safeEqual,
  ssoClientForHost,
  ssoCookieName,
} from '@/lib/sso';

/**
 * Single sign-on's return on a client host (architecture 4.3, decision 108): checks `state`
 * against this browser's cookie, exchanges the code with the PKCE verifier for a session of this
 * host and lands on the page the flow started from. Any failure shows `/auth/failed`, never
 * another redirect into the flow, so a broken flow can't loop.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
): Promise<Response> {
  const { locale: raw } = await params;
  const locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
  const host =
    request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ||
    request.headers.get('host') ||
    '';
  const client = ssoClientForHost(host);
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');

  // Relative locations: behind the container request.url is the server's own address.
  const go = (path: string) =>
    new NextResponse(null, {
      status: 303,
      headers: { Location: path, 'Cache-Control': 'no-store' },
    });
  const failed = (returnTo = '') => {
    const next = returnTo ? `?next=${encodeURIComponent(returnTo)}` : '';
    const response = go(`/${locale}/auth/failed${next}`);
    if (isValidState(state)) response.cookies.delete(ssoCookieName(state));
    return response;
  };

  if (!client || !isValidState(state) || !isValidCode(code)) return failed();
  const saved = decodeSsoCookie(request.cookies.get(ssoCookieName(state))?.value);
  if (!saved || !safeEqual(saved.state, state)) return failed();

  let tokens: AuthTokens;
  try {
    tokens = await exchangeSsoCode({ client, code, codeVerifier: saved.verifier });
  } catch {
    return failed(saved.returnTo);
  }

  const response = go(landingPath(client, locale, saved.returnTo, tokens.user.role));
  setTokenCookies(response, tokens, isSecureCookieEnv());
  response.cookies.delete(ssoCookieName(state));
  return response;
}
