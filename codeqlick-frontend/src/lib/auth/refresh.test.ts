import { describe, expect, it } from 'vitest';
import {
  authCookieOptions,
  jwtExpiry,
  loginRedirectUrl,
  needsRefresh,
  parseTokens,
  protectedPathLocale,
  serializeCookieHeader,
} from './refresh';

/** An unsigned JWT with this payload: only the payload is read. */
function jwt(payload: object): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${encode({ alg: 'none' })}.${encode(payload)}.signature`;
}

describe('session refresh helpers', () => {
  it('reads the expiry of a JWT and ignores anything else', () => {
    expect(jwtExpiry(jwt({ sub: 'x', exp: 1_800_000_000 }))).toBe(1_800_000_000);
    expect(jwtExpiry(jwt({ sub: 'x' }))).toBeNull();
    expect(jwtExpiry('not-a-jwt')).toBeNull();
    expect(jwtExpiry('a.%%%.c')).toBeNull();
  });

  it('refreshes a missing token or one about to expire, and trusts opaque ones', () => {
    const now = 1_800_000_000;
    expect(needsRefresh(undefined, now)).toBe(true);
    expect(needsRefresh(jwt({ exp: now + 20 }), now)).toBe(true);
    expect(needsRefresh(jwt({ exp: now + 600 }), now)).toBe(false);
    expect(needsRefresh('opaque-token', now)).toBe(false);
  });

  it('only guards the portal and the admin panel', () => {
    expect(protectedPathLocale('/es/admin/leads')).toBe('es');
    expect(protectedPathLocale('/en/portal')).toBe('en');
    expect(protectedPathLocale('/es/blog/admin')).toBeNull();
    expect(protectedPathLocale('/es')).toBeNull();
  });

  it('sends the visitor to the login page with where they were going', () => {
    const url = loginRedirectUrl(
      'https://codeqlick.com/es/admin',
      'es',
      '/es/admin/leads',
      '?page=2',
    );
    expect(url.pathname).toBe('/es/login');
    expect(url.searchParams.get('next')).toBe('/es/admin/leads?page=2');
  });

  it('accepts only well-formed token answers', () => {
    expect(parseTokens({ accessToken: 'a', refreshToken: 'r', expiresIn: 60 })).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: 60,
    });
    expect(parseTokens({ accessToken: 'a', refreshToken: 'r' })?.expiresIn).toBe(900);
    expect(parseTokens({ accessToken: 'a' })).toBeNull();
    expect(parseTokens('nope')).toBeNull();
  });

  it('sets httpOnly, lax cookies and serializes them for the request', () => {
    expect(authCookieOptions(59.9, true)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 59,
    });
    expect(authCookieOptions(-5, false).maxAge).toBe(0);
    expect(
      serializeCookieHeader([
        { name: 'cq_at', value: 'a' },
        { name: 'cq_rt', value: 'r' },
      ]),
    ).toBe('cq_at=a; cq_rt=r');
  });
});
