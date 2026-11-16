import { describe, expect, it } from 'vitest';
import {
  accountHostFor,
  accountHref,
  isAccountHost,
  mainHostOf,
  routeAccount,
} from './account-host';

describe('the account host (decision 108)', () => {
  it('finds it and its neighbours', () => {
    expect(isAccountHost('account.codeqlick.com')).toBe(true);
    expect(isAccountHost('account.localhost:3000')).toBe(true);
    expect(isAccountHost('codeqlick.com')).toBe(false);
    expect(mainHostOf('account.codeqlick.com')).toBe('codeqlick.com');
    expect(mainHostOf('cruising.localhost:3000')).toBe('localhost:3000');
    expect(accountHostFor('www.codeqlick.com')).toBe('account.codeqlick.com');
    expect(accountHostFor('swipe.codeqlick.com')).toBe('account.codeqlick.com');
  });

  it('serves its pages at short addresses and the sign-in pages as they are', () => {
    const host = 'account.codeqlick.com';
    expect(routeAccount('/fr', host, 'https:')).toEqual({ action: 'rewrite', to: '/fr/account' });
    expect(routeAccount('/fr/security', host, 'https:')).toEqual({
      action: 'rewrite',
      to: '/fr/account/security',
    });
    expect(routeAccount('/en/authorize', host, 'https:')).toEqual({
      action: 'rewrite',
      to: '/en/auth/authorize',
    });
    for (const page of [
      '/en/login',
      '/en/register/confirm',
      '/de/reset-password',
      '/en/auth/failed',
    ]) {
      expect(routeAccount(page, host, 'https:')).toEqual({ action: 'pass' });
    }
    expect(routeAccount('/en/account/apps', host, 'https:')).toEqual({
      action: 'redirect',
      to: '/en/apps',
    });
    expect(routeAccount('/en/account/apps', host, 'https:', false)).toEqual({ action: 'pass' });
  });

  it("sends the website's sections and the apps to the main host", () => {
    const host = 'account.codeqlick.com';
    expect(routeAccount('/es/portal', host, 'https:')).toEqual({
      action: 'redirect',
      to: 'https://codeqlick.com/es/portal',
    });
    expect(routeAccount('/fr/blog', host, 'https:')).toEqual({
      action: 'redirect',
      to: 'https://codeqlick.com/en/blog',
    });
    expect(routeAccount('/fr/cruising/map', host, 'https:')).toEqual({
      action: 'redirect',
      to: 'https://codeqlick.com/fr/cruising/map',
    });
  });

  it('links to it from anywhere, or under /account without single sign-on', () => {
    const origin = { host: 'codeqlick.com', protocol: 'https:' };
    expect(accountHref('es', '/security', origin)).toBe(
      'https://account.codeqlick.com/es/security',
    );
    expect(accountHref('es', '', origin)).toBe('https://account.codeqlick.com/es');
    expect(accountHref('es', '/security', origin, false)).toBe('/es/account/security');
  });
});
