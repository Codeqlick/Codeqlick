import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appHref,
  menuShortLink,
  routeWebapp,
  SITE_SECTIONS,
  switcherApps,
  WEBAPPS,
  webappForHost,
  webappHost,
} from './webapps';

const SHARED = ['login', 'register', 'forgot-password', 'reset-password', 'auth'];

describe('web apps on subdomains', () => {
  it('finds the app of a host', () => {
    expect(webappForHost('meetings.codeqlick.com')).toBe('meetings');
    expect(webappForHost('meetings.localhost:3000')).toBe('meetings');
    expect(webappForHost('meetings.codeqlick.com')).toBe('meetings');
    // A name that is no app of ours is no app (the retired app hosts answer 410 in Nginx).
    expect(webappForHost('cruising.codeqlick.com')).toBeNull();
    expect(webappForHost('codeqlick.com')).toBeNull();
    expect(webappForHost('www.codeqlick.com')).toBeNull();
    expect(webappForHost(undefined)).toBeNull();
    expect(webappHost('meetings', 'www.codeqlick.com')).toBe('meetings.codeqlick.com');
  });

  it("serves the app's routes at its host's short addresses", () => {
    const host = 'meetings.codeqlick.com';
    expect(routeWebapp('/es', host, 'https:')).toEqual({ action: 'rewrite', to: '/es/meetings' });
    expect(routeWebapp('/en/', host, 'https:')).toEqual({ action: 'rewrite', to: '/en/meetings' });
    expect(routeWebapp('/es/rooms', host, 'https:')).toEqual({
      action: 'rewrite',
      to: '/es/meetings/rooms',
    });
    expect(routeWebapp('/es/abc-defg-hjk', 'meetings.codeqlick.com', 'https:')).toEqual({
      action: 'rewrite',
      to: '/es/meetings/abc-defg-hjk',
    });
    expect(routeWebapp('/es/login', host, 'https:')).toEqual({ action: 'pass' });
    expect(routeWebapp('/es/register', host, 'https:')).toEqual({ action: 'pass' });
    expect(routeWebapp('/', host, 'https:')).toEqual({ action: 'pass' });
  });

  it('sends the old addresses with the app name to the short ones, on navigations only', () => {
    const host = 'meetings.codeqlick.com';
    expect(routeWebapp('/es/meetings', host, 'https:')).toEqual({ action: 'redirect', to: '/es' });
    expect(routeWebapp('/es/meetings/rooms', host, 'https:')).toEqual({
      action: 'redirect',
      to: '/es/rooms',
    });
    expect(routeWebapp('/es/meetings/rooms', host, 'https:', false)).toEqual({ action: 'pass' });
  });

  it("sends the site's other pages back to the main host", () => {
    expect(routeWebapp('/es/blog/post', 'meetings.codeqlick.com', 'https:')).toEqual({
      action: 'redirect',
      to: 'https://codeqlick.com/es/blog/post',
    });
    expect(routeWebapp('/es/portal', 'meetings.localhost:3000', 'http:')).toEqual({
      action: 'redirect',
      to: 'http://localhost:3000/es/portal',
    });
    expect(routeWebapp('/es/meetings', 'citas.codeqlick.com', 'https:')).toEqual({
      action: 'redirect',
      to: 'https://codeqlick.com/es/meetings',
    });
  });

  it("sends the app's pages on the main host to its subdomain, without the app name", () => {
    expect(routeWebapp('/es/meetings/rooms', 'codeqlick.com', 'https:')).toEqual({
      action: 'redirect',
      to: 'https://meetings.codeqlick.com/es/rooms',
    });
    expect(routeWebapp('/en/meetings', 'localhost:3000', 'http:')).toEqual({
      action: 'redirect',
      to: 'http://meetings.localhost:3000/en',
    });
    expect(routeWebapp('/es/blog', 'codeqlick.com', 'https:')).toEqual({ action: 'pass' });
  });

  it('writes links inside an app as its short addresses', () => {
    expect(appHref('meetings', '/meetings')).toBe('/');
    expect(appHref('meetings', '/meetings/rooms')).toBe('/rooms');
    expect(appHref('citas', '/citas?scope=past')).toBe('/?scope=past');
    expect(appHref('citas', '/login?next=/citas')).toBe('/login?next=/citas');
    expect(appHref('citas', '/citasx')).toBe('/citasx');
  });

  it("lists every section of the main site, so an app's host never takes it for its own", () => {
    const root = fileURLToPath(new URL('../app/[locale]/', import.meta.url));
    const folders = [
      ...readdirSync(root, { withFileTypes: true }),
      ...readdirSync(join(root, '(site)'), { withFileTypes: true }),
    ]
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('('))
      .map((entry) => entry.name)
      .filter((name) => !WEBAPPS.some((app) => app === name) && !SHARED.includes(name));
    expect(folders.toSorted()).toEqual([...SITE_SECTIONS].toSorted());
  });

  it('serves app pages asked for by IP address (Next.js calling itself)', () => {
    expect(routeWebapp('/es/meetings/rooms', '127.0.0.1:3000', 'http:')).toEqual({
      action: 'pass',
    });
    expect(routeWebapp('/es/meetings/rooms', '[::1]:3000', 'http:')).toEqual({ action: 'pass' });
  });
});

describe('the apps menu', () => {
  it("lists Codeqlick's other apps", () => {
    expect(switcherApps('meetings')).toEqual([{ app: 'citas' }, { app: 'cloud' }, { app: 'menu' }]);
    expect(switcherApps('cloud')).toEqual([{ app: 'meetings' }, { app: 'citas' }, { app: 'menu' }]);
    expect(switcherApps('menu').map((item) => item.app)).toEqual(['meetings', 'citas', 'cloud']);
  });
});

describe('Menu short link (architecture 4.20)', () => {
  const host = 'menu.codeqlick.com';

  it('reads a locale-less slug as the short link of a menu', () => {
    expect(menuShortLink('/mi-bar')).toBe('mi-bar');
    expect(menuShortLink('/mi-bar/')).toBe('mi-bar');
    expect(menuShortLink('/bar2-centro')).toBe('bar2-centro');
  });

  it('leaves everything else alone: locales, shared pages, app names, the routes of Menu', () => {
    for (const path of ['/en', '/es', '/login', '/register', '/blog', '/menu', '/citas']) {
      expect(menuShortLink(path), path).toBeNull();
    }
    for (const path of ['/editar', '/cartel', '/reportar', '/disponibilidad', '/qr', '/nueva']) {
      expect(menuShortLink(path), path).toBeNull();
    }
    // Longer paths, dashes at the ends, capitals and short names are no slugs.
    for (const path of ['/mi-bar/extra', '/-bar', '/Mi-Bar', '/ab', '/']) {
      expect(menuShortLink(path), path).toBeNull();
    }
  });

  it('rewrites the short link to the redirect route, on the menu host only', () => {
    expect(routeWebapp('/mi-bar', host, 'https:')).toEqual({
      action: 'rewrite',
      to: '/en/menu/qr/short/mi-bar',
    });
    expect(routeWebapp('/mi-bar', 'meetings.codeqlick.com', 'https:')).toEqual({ action: 'pass' });
    expect(routeWebapp('/mi-bar', 'codeqlick.com', 'https:')).toEqual({ action: 'pass' });
  });

  it('serves the public page and its routes at the short addresses', () => {
    expect(routeWebapp('/es/mi-bar', host, 'https:')).toEqual({
      action: 'rewrite',
      to: '/es/menu/mi-bar',
    });
    expect(routeWebapp('/es/editar/nueva', host, 'https:')).toEqual({
      action: 'rewrite',
      to: '/es/menu/editar/nueva',
    });
    expect(routeWebapp('/es/menu/editar/x', host, 'https:')).toEqual({
      action: 'redirect',
      to: '/es/editar/x',
    });
  });
});
