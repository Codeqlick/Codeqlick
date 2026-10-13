import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { me } from '@/lib/api/auth';
import { isApiError } from '@/lib/api/errors';
import type { AuthTokens, AuthUser, Role } from '@/lib/api/types';
import { env } from '@/lib/env';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './constants';
import { accessCookieOptions, refreshCookieOptions } from './refresh';

export { ACCESS_COOKIE, REFRESH_COOKIE };

/** Reads both tokens from the request cookies. */
export async function getTokens(): Promise<{ accessToken?: string; refreshToken?: string }> {
  const store = await cookies();
  return {
    accessToken: store.get(ACCESS_COOKIE)?.value || undefined,
    refreshToken: store.get(REFRESH_COOKIE)?.value || undefined,
  };
}

/** Server Actions / Route Handlers only (cookies can't be set during rendering). */
export async function setAuthCookies(tokens: Pick<AuthTokens, 'accessToken' | 'refreshToken' | 'expiresIn'>) {
  const store = await cookies();
  store.set(ACCESS_COOKIE, tokens.accessToken, accessCookieOptions(tokens.expiresIn, env.isProduction));
  store.set(REFRESH_COOKIE, tokens.refreshToken, refreshCookieOptions(env.isProduction));
}

/** Server Actions / Route Handlers only. */
export async function clearAuthCookies() {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}

/**
 * The signed-in user, or null. Memoized per request with React `cache()` so layouts and pages
 * share one `GET /auth/me` call. Only 401/403 mean "signed out"; other API failures propagate.
 */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const { accessToken } = await getTokens();
  if (!accessToken) return null;
  try {
    return await me(accessToken);
  } catch (error) {
    if (isApiError(error) && (error.status === 401 || error.status === 403)) return null;
    throw error;
  }
});

/** Only relative paths inside the current locale are accepted as `next` (no open redirects). */
export function safeNextPath(next: unknown, locale: string): string | null {
  if (typeof next !== 'string') return null;
  if (!next.startsWith(`/${locale}/`)) return null;
  if (next.startsWith('//') || next.includes('\\')) return null;
  // Reject anything that would resolve to another origin.
  try {
    const url = new URL(next, 'http://localhost');
    if (url.origin !== 'http://localhost') return null;
  } catch {
    return null;
  }
  return next;
}

export function homeForRole(locale: string, role: Role): string {
  return role === 'ADMIN' ? `/${locale}/admin` : `/${locale}/portal`;
}

/** Redirects to /{locale}/login?next=<nextPath> when signed out. */
export async function requireUser(locale: string, nextPath?: string): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    const next = nextPath ?? `/${locale}/portal`;
    redirect(`/${locale}/login?next=${encodeURIComponent(next)}`);
  }
  return user;
}

/** Like requireUser, and redirects to /{locale} when the role is not allowed. */
export async function requireRole(
  locale: string,
  roles: readonly Role[],
  nextPath?: string,
): Promise<AuthUser> {
  const user = await requireUser(locale, nextPath);
  if (!roles.includes(user.role)) redirect(`/${locale}`);
  return user;
}
