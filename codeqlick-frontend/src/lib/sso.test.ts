import { describe, expect, it } from 'vitest';
import {
  authorizeTarget,
  callbackUrl,
  clientHost,
  decodeSsoCookie,
  encodeSsoCookie,
  isLoopbackRedirect,
  isNativeSsoClient,
  isSsoClient,
  landingPath,
  parseAuthorizeQuery,
  pkceChallenge,
  randomToken,
  routeSignIn,
  safeEqual,
  safeReturnPath,
  ssoClientForHost,
  ssoCookieName,
  startSso,
} from './sso';

describe('single sign-on helpers (decision 108)', () => {
  it('computes the S256 challenge of RFC 7636', async () => {
    expect(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('makes 43-character random tokens, never twice the same', () => {
    const a = randomToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(a);
  });

  it('compares states in full', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });

  it('accepts only paths of this host in this locale as the way back', () => {
    expect(safeReturnPath('/es/portal/projects/1?tab=files', 'es')).toBe(
      '/es/portal/projects/1?tab=files',
    );
    expect(safeReturnPath('/es', 'es')).toBe('/es');
    for (const bad of [
      'https://evil.example/es',
      '//evil.example/es/portal',
      '/es//evil.example',
      '/es/\\evil.example',
      '/en/portal',
      'es/portal',
      '/es/auth/callback',
      '/es/login?next=/es/portal',
      '/es/portal\n',
      `/es/${'a'.repeat(2050)}`,
      null,
      42,
    ]) {
      expect(safeReturnPath(bad, 'es'), String(bad)).toBeNull();
    }
  });

  it('knows each host’s client and the clients’ fixed callbacks', () => {
    expect(ssoClientForHost('codeqlick.com')).toBe('site');
    expect(ssoClientForHost('meetings.codeqlick.com')).toBe('meetings');
    expect(ssoClientForHost('account.codeqlick.com')).toBeNull();
    expect(clientHost('site', 'account.codeqlick.com')).toBe('codeqlick.com');
    expect(clientHost('citas', 'account.codeqlick.com')).toBe('citas.codeqlick.com');
    expect(callbackUrl('meetings', 'account.codeqlick.com', 'https:', 'es')).toBe(
      'https://meetings.codeqlick.com/es/auth/callback',
    );
    expect(callbackUrl('site', 'account.codeqlick.com', 'https:', 'en')).toBe(
      'https://codeqlick.com/en/auth/callback',
    );
  });

  it('reads an authorize request only when everything is there and well formed', () => {
    const good = new URLSearchParams({
      client: 'meetings',
      state: 'a'.repeat(43),
      code_challenge: 'b'.repeat(43),
      code_challenge_method: 'S256',
    });
    expect(parseAuthorizeQuery(good)).toEqual({
      client: 'meetings',
      state: 'a'.repeat(43),
      codeChallenge: 'b'.repeat(43),
      register: false,
      redirectUri: null,
    });
    const variants: Record<string, string>[] = [
      { client: 'evil.example.com' },
      { client: 'account' },
      { state: 'short' },
      { code_challenge: 'plain' },
      { code_challenge_method: 'plain' },
    ];
    for (const change of variants) {
      const query = new URLSearchParams(good);
      for (const [key, value] of Object.entries(change)) query.set(key, value);
      expect(parseAuthorizeQuery(query), JSON.stringify(change)).toBeNull();
    }
    // A web client's callback is fixed by its host: a redirect sent for it is refused.
    const withRedirect = new URLSearchParams(good);
    withRedirect.set('redirect_uri', 'http://127.0.0.1:49152/callback');
    expect(parseAuthorizeQuery(withRedirect)).toBeNull();
  });

  it('keeps desktop programs apart from the hosts', () => {
    expect(isNativeSsoClient('ageofvelkara')).toBe(true);
    expect(isSsoClient('ageofvelkara')).toBe(false);
    expect(isNativeSsoClient('site')).toBe(false);
    expect(isNativeSsoClient('meetings')).toBe(false);
  });

  it('accepts only http://127.0.0.1:<port>/callback with a port from 1024 to 65535', () => {
    const good = [
      'http://127.0.0.1:1024/callback',
      'http://127.0.0.1:49152/callback',
      'http://127.0.0.1:65535/callback',
    ];
    expect(good.filter((value) => !isLoopbackRedirect(value))).toEqual([]);
    const bad = [
      'http://127.0.0.1:1023/callback',
      'http://127.0.0.1:65536/callback',
      'http://127.0.0.1:99999/callback',
      'http://127.0.0.1:0/callback',
      'http://127.0.0.1:08080/callback',
      'http://127.0.0.1/callback',
      'http://localhost:49152/callback',
      'http://[::1]:49152/callback',
      'http://127.0.0.2:49152/callback',
      'http://127.0.0.1.evil.example:49152/callback',
      'https://127.0.0.1:49152/callback',
      'http://user@127.0.0.1:49152/callback',
      'http://user:pass@127.0.0.1:49152/callback',
      'http://127.0.0.1:49152/callback/',
      'http://127.0.0.1:49152/other',
      'http://127.0.0.1:49152/callback?x=1',
      'http://127.0.0.1:49152/callback#x',
      'http://127.0.0.1:49152/callback\n',
      'HTTP://127.0.0.1:49152/callback',
      ' http://127.0.0.1:49152/callback',
      '',
      null,
      undefined,
      49152,
    ];
    expect(bad.filter((value) => isLoopbackRedirect(value))).toEqual([]);
  });

  it('reads a desktop program’s authorize request only with a loopback redirect', () => {
    const good = new URLSearchParams({
      client: 'ageofvelkara',
      redirect_uri: 'http://127.0.0.1:49152/callback',
      state: 'a'.repeat(43),
      code_challenge: 'b'.repeat(43),
      code_challenge_method: 'S256',
      screen: 'register',
    });
    expect(parseAuthorizeQuery(good)).toEqual({
      client: 'ageofvelkara',
      redirectUri: 'http://127.0.0.1:49152/callback',
      state: 'a'.repeat(43),
      codeChallenge: 'b'.repeat(43),
      register: true,
    });
    const without = new URLSearchParams(good);
    without.delete('redirect_uri');
    expect(parseAuthorizeQuery(without)).toBeNull();
    for (const redirect of [
      'http://localhost:49152/callback',
      'http://127.0.0.1:80/callback',
      'https://127.0.0.1:49152/callback',
      'http://127.0.0.1:49152/callback?x=1',
      'https://evil.example.com/callback',
    ]) {
      const query = new URLSearchParams(good);
      query.set('redirect_uri', redirect);
      expect(parseAuthorizeQuery(query), redirect).toBeNull();
    }
    for (const change of [{ state: 'short' }, { code_challenge_method: 'plain' }]) {
      const query = new URLSearchParams(good);
      for (const [key, value] of Object.entries(change)) query.set(key, value);
      expect(parseAuthorizeQuery(query), JSON.stringify(change)).toBeNull();
    }
  });

  it('sends the code to the loopback address of a desktop program, else to the fixed callback', () => {
    const web = parseAuthorizeQuery(
      new URLSearchParams({
        client: 'meetings',
        state: 's'.repeat(43),
        code_challenge: 'b'.repeat(43),
        code_challenge_method: 'S256',
      }),
    )!;
    expect(authorizeTarget(web, 'c'.repeat(43), 'account.codeqlick.com', 'https:', 'es')).toBe(
      `https://meetings.codeqlick.com/es/auth/callback?code=${'c'.repeat(43)}&state=${'s'.repeat(43)}`,
    );
    const native = parseAuthorizeQuery(
      new URLSearchParams({
        client: 'ageofvelkara',
        redirect_uri: 'http://127.0.0.1:49152/callback',
        state: 's'.repeat(43),
        code_challenge: 'b'.repeat(43),
        code_challenge_method: 'S256',
      }),
    )!;
    expect(authorizeTarget(native, 'c'.repeat(43), 'account.codeqlick.com', 'https:', 'en')).toBe(
      `http://127.0.0.1:49152/callback?code=${'c'.repeat(43)}&state=${'s'.repeat(43)}`,
    );
  });

  it('starts a flow: the authorize URL carries the challenge, the cookie the verifier', async () => {
    const flow = await startSso({
      client: 'meetings',
      host: 'meetings.codeqlick.com',
      protocol: 'https:',
      locale: 'es',
      next: '/es/meetings/rooms',
    });
    const url = new URL(flow.url);
    expect(url.origin).toBe('https://account.codeqlick.com');
    expect(url.pathname).toBe('/es/authorize');
    const state = url.searchParams.get('state')!;
    expect(flow.cookie.name).toBe(ssoCookieName(state));
    const saved = decodeSsoCookie(flow.cookie.value)!;
    expect(saved).toMatchObject({ state, returnTo: '/es/meetings/rooms' });
    expect(url.searchParams.get('code_challenge')).toBe(await pkceChallenge(saved.verifier));
    // The verifier and the way back never leave the client host.
    expect(flow.url).not.toContain(saved.verifier);
    expect(flow.url).not.toContain('meetings%2Frooms');
    expect(flow.url).not.toContain('/es/meetings/rooms');

    const open = await startSso({
      client: 'site',
      host: 'codeqlick.com',
      protocol: 'https:',
      locale: 'en',
      next: 'https://evil.example',
      register: true,
    });
    expect(new URL(open.url).searchParams.get('screen')).toBe('register');
    expect(decodeSsoCookie(open.cookie.value)?.returnTo).toBe('');
  });

  it('refuses a tampered cookie', () => {
    expect(decodeSsoCookie(undefined)).toBeNull();
    expect(decodeSsoCookie('not-base64-json')).toBeNull();
    expect(
      decodeSsoCookie(encodeSsoCookie({ state: 'x', verifier: 'y', returnTo: '/en' })),
    ).toBeNull();
  });

  it('lands on the path the flow started from, else the host’s home', () => {
    expect(landingPath('site', 'es', '/es/portal/support', 'CLIENT')).toBe('/es/portal/support');
    expect(landingPath('site', 'es', '', 'ADMIN')).toBe('/es/admin');
    expect(landingPath('site', 'es', '', 'CLIENT')).toBe('/es/portal');
    expect(landingPath('meetings', 'es', '/es/meetings/rooms', 'CLIENT')).toBe('/es/rooms');
    expect(landingPath('cloud', 'en', '//evil.example', 'CLIENT')).toBe('/en');
  });

  it('routes the sign-in addresses of a client host', () => {
    const route = (path: string, host = 'meetings.codeqlick.com') => {
      const url = new URL(`https://${host}${path}`);
      return routeSignIn(url.pathname, url.searchParams, host, 'https:');
    };
    expect(route('/es/login?next=/es/rooms')).toEqual({
      action: 'start',
      locale: 'es',
      next: '/es/rooms',
      register: false,
    });
    expect(route('/en/register')).toMatchObject({ action: 'start', register: true });
    expect(route('/en/reset-password?token=abc')).toEqual({
      action: 'redirect',
      to: 'https://account.codeqlick.com/en/reset-password?token=abc',
    });
    expect(route('/en/register/confirm?token=abc')).toEqual({
      action: 'redirect',
      to: 'https://account.codeqlick.com/en/register/confirm?token=abc&app=meetings',
    });
    expect(route('/es/register?invitation=xyz', 'codeqlick.com')).toEqual({
      action: 'redirect',
      to: 'https://account.codeqlick.com/es/register?invitation=xyz',
    });
    expect(route('/es/confirm-email?token=t', 'codeqlick.com')).toMatchObject({
      to: 'https://account.codeqlick.com/es/confirm-email?token=t',
    });
    expect(route('/es/account/security', 'codeqlick.com')).toMatchObject({
      to: 'https://account.codeqlick.com/es/security',
    });
    expect(route('/es/login/verify', 'codeqlick.com')).toMatchObject({
      to: 'https://account.codeqlick.com/es/login',
    });
    expect(route('/en/rooms')).toEqual({ action: 'pass' });
    // The account host serves them itself.
    expect(route('/en/login', 'account.codeqlick.com')).toEqual({ action: 'pass' });
  });
});
