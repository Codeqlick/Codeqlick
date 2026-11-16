import { describe, expect, it } from 'vitest';
import en from '../messages/en.json';
import {
  citasMenu,
  cloudMenu,
  cruisingMenu,
  isCurrentPath,
  meetingsMenu,
  swipeMenu,
  videochatMenu,
  type AppMenuConfig,
} from './app-menus';

/** Section id → item ids, the shape the drawer shows. */
function shape(config: AppMenuConfig) {
  return Object.fromEntries(
    config.sections.map((section) => [section.id, section.items.map((item) => item.id)]),
  );
}

/** Every message key a configuration uses. */
function labels(config: AppMenuConfig): string[] {
  return [
    ...config.sections.flatMap((section) => [
      section.heading,
      ...section.items.map((item) => item.label),
    ]),
    ...config.footer.map((item) => item.label),
  ];
}

function message(key: string): unknown {
  let node: unknown = en;
  for (const part of key.split('.')) {
    node = typeof node === 'object' && node ? (node as Record<string, unknown>)[part] : undefined;
  }
  return node;
}

describe('cruisingMenu', () => {
  it('shows a visitor only the public pages', () => {
    const menu = cruisingMenu('es', { signedIn: false });
    expect(shape(menu)).toEqual({ discover: ['map', 'places', 'health'], me: ['propose'] });
    expect(menu.footer.map((item) => item.id)).toEqual(['rules']);
    expect(menu.signInHref).toBe('/login?next=%2Fes%2Fcruising%2Fmap');
  });

  it('adds My spots once signed in, before entering', () => {
    expect(shape(cruisingMenu('en', { signedIn: true, entered: false }))).toEqual({
      discover: ['map', 'places', 'health'],
      me: ['my-spots', 'propose'],
    });
  });

  it('gives an entered member every group', () => {
    expect(shape(cruisingMenu('en', { signedIn: true, entered: true }))).toEqual({
      discover: ['map', 'places', 'meetups', 'health'],
      community: ['messages', 'rooms', 'favorites', 'trips', 'notifications'],
      me: ['profile', 'my-spots', 'propose'],
    });
  });

  it('keeps every link the header had', () => {
    const hrefs = cruisingMenu('en', { signedIn: true, entered: true }).sections.flatMap(
      (section) => section.items.map((item) => item.href),
    );
    for (const href of [
      '/cruising/map',
      '/cruising/places',
      '/cruising/health',
      '/cruising/new',
      '/cruising/my-spots',
      '/cruising/favorites',
      '/cruising/meetups',
      '/cruising/rooms',
      '/cruising/messages',
      '/cruising/me',
    ]) {
      expect(hrefs).toContain(href);
    }
  });
});

describe('the other apps', () => {
  it('Swipe: the deck, matches and photos only when signed in', () => {
    expect(shape(swipeMenu('es', { signedIn: false }))).toEqual({});
    expect(shape(swipeMenu('es', { signedIn: true }))).toEqual({
      swipe: ['deck', 'matches', 'photos'],
    });
    expect(swipeMenu('es', { signedIn: false }).signInHref).toBe(
      '/login?next=%2Fes%2Fswipe%2Fdeck',
    );
  });

  it('Videochat: contacts and profile only when signed in, rules always', () => {
    expect(shape(videochatMenu('en', { signedIn: false }))).toEqual({ videochat: ['home'] });
    expect(shape(videochatMenu('en', { signedIn: true }))).toEqual({
      videochat: ['home', 'contacts', 'settings'],
    });
    expect(videochatMenu('en', { signedIn: false }).footer.map((item) => item.href)).toEqual([
      '/videochat/rules',
    ]);
  });

  it('Meetings and Citas: their home and their sign-in link', () => {
    expect(shape(meetingsMenu())).toEqual({ meetings: ['home'] });
    expect(meetingsMenu().signInHref).toBe('/login?next=/meetings');
    expect(shape(citasMenu())).toEqual({ citas: ['home'] });
    expect(citasMenu().signInHref).toBe('/login?next=/citas');
  });

  it('Cloud: the console when signed in, the docs as an outside link when they live apart', () => {
    expect(shape(cloudMenu('es', { signedIn: false }, '/cloud/docs'))).toEqual({
      cloud: ['home', 'docs'],
    });
    const menu = cloudMenu('es', { signedIn: true }, 'https://docs.example.com/es');
    expect(shape(menu)).toEqual({ cloud: ['home', 'docs', 'console'] });
    expect(menu.sections[0]!.items[1]).toMatchObject({ external: true });
    expect(cloudMenu('es', { signedIn: true }, '/cloud/docs').sections[0]!.items[1]!.external).toBe(
      undefined,
    );
    expect(menu.signInHref).toBe('/login?next=/es/cloud/console');
  });

  it('only uses messages that exist', () => {
    const configs = [
      cruisingMenu('en', { signedIn: true, entered: true }),
      swipeMenu('en', { signedIn: true }),
      videochatMenu('en', { signedIn: true }),
      meetingsMenu(),
      citasMenu(),
      cloudMenu('en', { signedIn: true }, '/cloud/docs'),
    ];
    for (const key of configs.flatMap(labels)) expect(typeof message(key), key).toBe('string');
  });
});

describe('isCurrentPath', () => {
  it('matches the route on the main host and the short address on the app host', () => {
    expect(isCurrentPath('/cruising/map', '/cruising/map', 'cruising')).toBe(true);
    expect(isCurrentPath('/map', '/cruising/map', 'cruising')).toBe(true);
    expect(isCurrentPath('/map/', '/cruising/map', 'cruising')).toBe(true);
    expect(isCurrentPath('/places', '/cruising/map', 'cruising')).toBe(false);
  });

  it('marks a section for the pages under it', () => {
    expect(isCurrentPath('/messages/abc', '/cruising/messages', 'cruising')).toBe(true);
    expect(isCurrentPath('/cruising/places/es/madrid', '/cruising/places', 'cruising')).toBe(true);
    expect(isCurrentPath('/messagesx', '/cruising/messages', 'cruising')).toBe(false);
  });

  it("marks the app's home only on the home itself", () => {
    expect(isCurrentPath('/', '/videochat', 'videochat')).toBe(true);
    expect(isCurrentPath('/videochat', '/videochat', 'videochat')).toBe(true);
    expect(isCurrentPath('/contacts', '/videochat', 'videochat')).toBe(false);
    expect(isCurrentPath('/videochat/contacts', '/videochat', 'videochat')).toBe(false);
  });

  it('never marks an outside link', () => {
    expect(isCurrentPath('/docs', 'https://docs.example.com/docs', 'cloud')).toBe(false);
  });
});
