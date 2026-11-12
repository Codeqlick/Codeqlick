import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appHref,
  routeWebapp,
  SITE_SECTIONS,
  switcherApps,
  WEBAPPS,
  webappForHost,
  webappHost,
} from './webapps';

const SHARED = ['login', 'register', 'forgot-password', 'reset-password'];

describe('web apps on subdomains', () => {
  it('finds the app of a host', () => {
    expect(webappForHost('videochat.codeqlick.com')).toBe('videochat');
    expect(webappForHost('videochat.localhost:3000')).toBe('videochat');
    expect(webappForHost('meetings.codeqlick.com')).toBe('meetings');
    expect(webappForHost('swipe.codeqlick.com')).toBe('swipe');
    expect(webappForHost('codeqlick.com')).toBeNull();
    expect(webappForHost('www.codeqlick.com')).toBeNull();
    expect(webappForHost(undefined)).toBeNull();
    expect(webappHost('videochat', 'www.codeqlick.com')).toBe('videochat.codeqlick.com');
  });

  it("serves the app's routes at its host's short addresses", () => {
    const host = 'videochat.codeqlick.com';
    expect(routeWebapp('/es', host, 'https:')).toEqual({ action: 'rewrite', to: '/es/videochat' });
    expect(routeWebapp('/en/', host, 'https:')).toEqual({ action: 'rewrite', to: '/en/videochat' });
    expect(routeWebapp('/es/room', host, 'https:')).toEqual({
      action: 'rewrite',
      to: '/es/videochat/room',
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
    const host = 'videochat.codeqlick.com';
    expect(routeWebapp('/es/videochat', host, 'https:')).toEqual({ action: 'redirect', to: '/es' });
    expect(routeWebapp('/es/videochat/room', host, 'https:')).toEqual({
      action: 'redirect',
      to: '/es/room',
    });
    expect(routeWebapp('/es/videochat/room', host, 'https:', false)).toEqual({ action: 'pass' });
  });

  it("sends the site's other pages back to the main host", () => {
    expect(routeWebapp('/es/blog/post', 'videochat.codeqlick.com', 'https:')).toEqual({
      action: 'redirect',
      to: 'https://codeqlick.com/es/blog/post',
    });
    expect(routeWebapp('/es/portal', 'videochat.localhost:3000', 'http:')).toEqual({
      action: 'redirect',
      to: 'http://localhost:3000/es/portal',
    });
    expect(routeWebapp('/es/meetings', 'citas.codeqlick.com', 'https:')).toEqual({
      action: 'redirect',
      to: 'https://codeqlick.com/es/meetings',
    });
  });

  it("sends the app's pages on the main host to its subdomain, without the app name", () => {
    expect(routeWebapp('/es/videochat/room', 'codeqlick.com', 'https:')).toEqual({
      action: 'redirect',
      to: 'https://videochat.codeqlick.com/es/room',
    });
    expect(routeWebapp('/en/videochat', 'localhost:3000', 'http:')).toEqual({
      action: 'redirect',
      to: 'http://videochat.localhost:3000/en',
    });
    expect(routeWebapp('/es/blog', 'codeqlick.com', 'https:')).toEqual({ action: 'pass' });
  });

  it('writes links inside an app as its short addresses', () => {
    expect(appHref('videochat', '/videochat')).toBe('/');
    expect(appHref('videochat', '/videochat/room')).toBe('/room');
    expect(appHref('citas', '/citas?scope=past')).toBe('/?scope=past');
    expect(appHref('citas', '/login?next=/citas')).toBe('/login?next=/citas');
    expect(appHref('swipe', '/swiper')).toBe('/swiper');
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
    expect(routeWebapp('/es/videochat/room', '127.0.0.1:3000', 'http:')).toEqual({
      action: 'pass',
    });
    expect(routeWebapp('/es/videochat/room', '[::1]:3000', 'http:')).toEqual({ action: 'pass' });
  });
});

describe('the apps menu', () => {
  it('lists only the apps for everyone inside them', () => {
    expect(switcherApps('meetings')).toEqual([
      { app: 'citas', adult: false },
      { app: 'cloud', adult: false },
    ]);
    expect(switcherApps('cloud')).toEqual([
      { app: 'meetings', adult: false },
      { app: 'citas', adult: false },
    ]);
  });

  it('lists every other app inside an 18+ app, the 18+ ones last', () => {
    expect(switcherApps('videochat')).toEqual([
      { app: 'meetings', adult: false },
      { app: 'citas', adult: false },
      { app: 'cloud', adult: false },
      { app: 'swipe', adult: true },
    ]);
  });
});
