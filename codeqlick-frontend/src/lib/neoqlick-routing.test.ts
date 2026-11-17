import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routeAccount } from './account-host';
import { hostApp, requestLocales } from './locales';
import { callbackUrl, parseAuthorizeQuery, routeSignIn, ssoClientForHost } from './sso';
import { routePortal, routeWebapp, switcherApps, webappForHost } from './webapps';

beforeEach(() => vi.stubEnv('NEOQLICK_URL', 'https://neoqlick.com'));
afterEach(() => vi.unstubAllEnvs());

const P = 'https:';

describe('Neoqlick hosts (architecture 4.18)', () => {
  it('knows only Neoqlick’s apps on its hosts', () => {
    expect(webappForHost('cruising.neoqlick.com')).toBe('cruising');
    expect(webappForHost('meetings.neoqlick.com')).toBeNull();
    expect(webappForHost('neoqlick.com')).toBeNull();
    expect(hostApp('neoqlick.com')).toBe('portal');
    expect(hostApp('account.neoqlick.com')).toBe('account');
  });

  it('serves the portal in six languages', () => {
    expect(requestLocales('/fr', hostApp('neoqlick.com'))).toHaveLength(6);
    expect(requestLocales('/fr', hostApp('swipe.neoqlick.com'))).toHaveLength(2);
  });

  it('rewrites the portal’s pages to its route and sends the apps to their hosts', () => {
    expect(routePortal('/es', 'neoqlick.com', P)).toEqual({
      action: 'rewrite',
      to: '/es/neoqlick',
    });
    expect(routePortal('/de/terms', 'neoqlick.com', P)).toEqual({
      action: 'rewrite',
      to: '/de/neoqlick/terms',
    });
    expect(routePortal('/en/safety-contact', 'neoqlick.com', P)).toEqual({ action: 'pass' });
    expect(routePortal('/en/neoqlick/privacy', 'neoqlick.com', P)).toEqual({
      action: 'redirect',
      to: '/en/privacy',
    });
    expect(routePortal('/en/cruising/map', 'neoqlick.com', P)).toEqual({
      action: 'redirect',
      to: 'https://cruising.neoqlick.com/en/map',
    });
  });

  it('keeps an app’s host to its own pages and the portal’s sections on the portal', () => {
    expect(routeWebapp('/es/map', 'cruising.neoqlick.com', P)).toEqual({
      action: 'rewrite',
      to: '/es/cruising/map',
    });
    expect(routeWebapp('/es/legal', 'swipe.neoqlick.com', P)).toEqual({
      action: 'redirect',
      to: 'https://neoqlick.com/es/legal',
    });
    // Another Neoqlick app's name is a link to that app's host.
    expect(routeWebapp('/es/videochat', 'swipe.neoqlick.com', P)).toEqual({
      action: 'redirect',
      to: 'https://neoqlick.com/es/videochat',
    });
  });

  it('lists the other two Neoqlick apps and nothing of Codeqlick', () => {
    expect(switcherApps('cruising', 'neoqlick').map((entry) => entry.app)).toEqual([
      'swipe',
      'videochat',
    ]);
  });

  it('sends the account host’s website sections to the portal', () => {
    expect(routeAccount('/es/terms', 'account.neoqlick.com', P)).toEqual({
      action: 'redirect',
      to: 'https://neoqlick.com/es/terms',
    });
  });
});

describe('single sign-on per realm', () => {
  it('has clients only on app hosts (the portal has no session)', () => {
    expect(ssoClientForHost('cruising.neoqlick.com')).toBe('cruising');
    expect(ssoClientForHost('neoqlick.com')).toBeNull();
    expect(ssoClientForHost('account.neoqlick.com')).toBeNull();
  });

  it('derives the callback from the account host', () => {
    expect(callbackUrl('swipe', 'account.neoqlick.com', P, 'es')).toBe(
      'https://swipe.neoqlick.com/es/auth/callback',
    );
  });

  it('refuses a client of the other realm', () => {
    const query = (client: string) =>
      new URLSearchParams({
        client,
        state: 'a'.repeat(32),
        code_challenge: 'b'.repeat(43),
        code_challenge_method: 'S256',
      });
    expect(parseAuthorizeQuery(query('cruising'), 'account.neoqlick.com')?.client).toBe('cruising');
    expect(parseAuthorizeQuery(query('site'), 'account.neoqlick.com')).toBeNull();
    expect(parseAuthorizeQuery(query('meetings'), 'account.neoqlick.com')).toBeNull();
    // The 18+ apps are no client of Codeqlick's account host any more (architecture 4.18).
    expect(parseAuthorizeQuery(query('cruising'), 'account.codeqlick.com')).toBeNull();
    expect(parseAuthorizeQuery(query('meetings'), 'account.codeqlick.com')?.client).toBe(
      'meetings',
    );
  });

  it('starts the flow on an app and sends the portal to the account host', () => {
    const none = new URLSearchParams();
    expect(routeSignIn('/en/login', none, 'cruising.neoqlick.com', P)).toMatchObject({
      action: 'start',
    });
    expect(routeSignIn('/en/login', none, 'neoqlick.com', P)).toEqual({
      action: 'redirect',
      to: 'https://account.neoqlick.com/en/login',
    });
  });
});
