import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appHref,
  legacyAppHostRedirect,
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
    // The 18+ apps left Codeqlick (4.18): their old hosts are no app on it.
    expect(webappForHost('cruising.codeqlick.com')).toBeNull();
    expect(webappForHost('swipe.codeqlick.com')).toBeNull();
    expect(webappForHost('videochat.codeqlick.com')).toBeNull();
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
      .filter(
        (name) =>
          !WEBAPPS.some((app) => app === name) && name !== 'neoqlick' && !SHARED.includes(name),
      );
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
  it("lists Codeqlick's other apps and never an 18+ one", () => {
    expect(switcherApps('meetings')).toEqual([{ app: 'citas' }, { app: 'cloud' }]);
    expect(switcherApps('cloud')).toEqual([{ app: 'meetings' }, { app: 'citas' }]);
  });
});

describe('the 18+ apps left Codeqlick (architecture 4.18)', () => {
  beforeEach(() => vi.stubEnv('NEOQLICK_URL', 'https://neoqlick.com'));
  afterEach(() => vi.unstubAllEnvs());

  it("sends the website's addresses of the apps to Neoqlick's hosts", () => {
    expect(routeWebapp('/es/cruising/map', 'codeqlick.com', 'https:')).toEqual({
      action: 'redirect',
      to: 'https://cruising.neoqlick.com/es/map',
    });
    expect(routeWebapp('/en/swipe', 'codeqlick.com', 'https:')).toEqual({
      action: 'redirect',
      to: 'https://swipe.neoqlick.com/en',
    });
    expect(routeWebapp('/fr/videochat/rules', 'meetings.codeqlick.com', 'https:')).toEqual({
      action: 'redirect',
      to: 'https://videochat.neoqlick.com/fr/rules',
    });
  });

  it('leaves them alone where there are no Neoqlick hosts (staging) and for IP addresses', () => {
    vi.stubEnv('NEOQLICK_URL', '');
    expect(routeWebapp('/es/cruising/map', 'codeqlick.com', 'https:')).toEqual({ action: 'pass' });
    vi.stubEnv('NEOQLICK_URL', 'https://neoqlick.com');
    expect(routeWebapp('/es/cruising/map', '127.0.0.1:3000', 'http:')).toEqual({ action: 'pass' });
  });

  it('redirects the old app hosts as a safety net, keeping path and query', () => {
    expect(legacyAppHostRedirect('/es/map', '?q=1', 'cruising.codeqlick.com', 'https:')).toBe(
      'https://cruising.neoqlick.com/es/map?q=1',
    );
    expect(legacyAppHostRedirect('/es/cruising/map', '', 'cruising.codeqlick.com', 'https:')).toBe(
      'https://cruising.neoqlick.com/es/map',
    );
    expect(legacyAppHostRedirect('/en', '', 'swipe.codeqlick.com', 'https:')).toBe(
      'https://swipe.neoqlick.com/en',
    );
    expect(legacyAppHostRedirect('/en', '', 'meetings.codeqlick.com', 'https:')).toBeNull();
    expect(legacyAppHostRedirect('/en', '', 'cruising.neoqlick.com', 'https:')).toBeNull();
    expect(legacyAppHostRedirect('/en', '', '127.0.0.1:3000', 'http:')).toBeNull();
  });
});
