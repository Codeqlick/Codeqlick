import { describe, expect, it } from 'vitest';
import en from '../messages/en.json';
import {
  accountSettingsHref,
  accountSiteOrigin,
  appFooter,
  citasMenu,
  cloudMenu,
  cruisingMenu,
  isCurrentPath,
  meetingsMenu,
  swipeMenu,
  videochatMenu,
  type AppMenuConfig,
} from './app-menus';
import { WEBAPPS, type Webapp } from './webapps';

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
    ...(config.profile ? [config.profile.label] : []),
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
      // The profile is on the user card now, not in the list.
      me: ['my-spots', 'propose'],
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

describe('the user card', () => {
  const profile = (config: AppMenuConfig) =>
    config.profile ? [config.profile.href, config.profile.label] : null;

  it('signed out: no profile, sign in and sign up', () => {
    for (const config of [
      cruisingMenu('es', { signedIn: false }),
      swipeMenu('es', { signedIn: false }),
      videochatMenu('es', { signedIn: false }),
      cloudMenu('es', { signedIn: false }, '/cloud/docs'),
      meetingsMenu(),
      citasMenu(),
    ]) {
      expect(config.profile).toBeNull();
      expect(config.registerHref).toBe('/register');
      expect(config.signInHref).toMatch(/^\/login\?next=/);
    }
  });

  it('the 18+ apps: the entry screen before entering, the profile after', () => {
    const before = { signedIn: true, entered: false };
    const after = { signedIn: true, entered: true };
    expect(profile(cruisingMenu('es', before))).toEqual([
      '/cruising/me',
      'AppMenu.card.completeProfile',
    ]);
    expect(profile(cruisingMenu('es', after))).toEqual(['/cruising/me', 'AppMenu.card.profile']);
    expect(profile(swipeMenu('es', before))).toEqual([
      '/swipe/deck',
      'AppMenu.card.completeProfile',
    ]);
    expect(profile(swipeMenu('es', after))).toEqual(['/swipe/photos', 'AppMenu.card.profile']);
    expect(profile(videochatMenu('es', before))).toEqual([
      '/videochat/room',
      'AppMenu.card.completeProfile',
    ]);
    expect(profile(videochatMenu('es', after))).toEqual([
      '/videochat/settings',
      'AppMenu.card.profile',
    ]);
  });

  it('Cloud: the console; Meetings and Citas: no profile of their own', () => {
    expect(profile(cloudMenu('es', { signedIn: true }, '/cloud/docs'))).toEqual([
      '/cloud/console',
      'Cloud.nav.console',
    ]);
    expect(meetingsMenu().profile).toBeNull();
    expect(citasMenu().profile).toBeNull();
  });

  it("My account: the portal's (the admin's for the team) until the account site is on", () => {
    const site = 'https://codeqlick.com';
    expect(accountSettingsHref('es', 'CLIENT', site, null)).toBe(
      'https://codeqlick.com/es/portal/account',
    );
    expect(accountSettingsHref('en', 'ADMIN', `${site}/`, null)).toBe(
      'https://codeqlick.com/en/admin/account',
    );
    // The website speaks English and Spanish only.
    expect(accountSettingsHref('fr', 'CLIENT', site, null)).toBe(
      'https://codeqlick.com/en/portal/account',
    );
    const origin = accountSiteOrigin(site, 'true');
    expect(origin).toBe('https://account.codeqlick.com');
    expect(accountSettingsHref('fr', 'ADMIN', site, origin)).toBe(
      'https://account.codeqlick.com/fr',
    );
    expect(accountSiteOrigin('https://www.codeqlick.com', 'true')).toBe(
      'https://account.codeqlick.com',
    );
    expect(accountSiteOrigin(site, undefined)).toBeNull();
    expect(accountSiteOrigin(site, 'false')).toBeNull();
  });

  it('only uses messages that exist', () => {
    const configs = [
      cruisingMenu('en', { signedIn: true }),
      swipeMenu('en', { signedIn: true }),
      videochatMenu('en', { signedIn: true }),
    ];
    for (const key of configs.flatMap(labels)) expect(typeof message(key), key).toBe('string');
    for (const key of ['openFor', 'label', 'account', 'verified', 'register']) {
      const path = key === 'openFor' ? `AppMenu.${key}` : `AppMenu.card.${key}`;
      expect(typeof message(path), path).toBe('string');
    }
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

describe('appFooter', () => {
  const site = { locale: 'es', siteUrl: 'https://codeqlick.com/', legal: true };
  const ids = (app: Webapp, context = site) => appFooter(app, context).map((item) => item.id);

  it("gives Cruising and Swipe their own legal pages and the website's contact", () => {
    expect(ids('cruising')).toEqual(['takedown', 'rules', 'terms', 'privacy', 'contact']);
    const swipe = appFooter('swipe', site);
    expect(swipe.map((item) => item.href)).toEqual([
      '/swipe/takedown',
      '/swipe/rules',
      '/swipe/terms-of-use',
      '/swipe/privacy-policy',
      'https://codeqlick.com/es/contact',
    ]);
    expect(swipe.filter((item) => item.external).map((item) => item.id)).toEqual(['contact']);
  });

  it("links Videochat, Meetings and Citas to the website's legal pages and contact", () => {
    expect(ids('videochat')).toEqual(['rules', 'terms', 'privacy', 'contact']);
    expect(ids('meetings')).toEqual(['terms', 'privacy', 'contact']);
    const citas = appFooter('citas', { ...site, locale: 'en' });
    expect(citas.map((item) => item.href)).toEqual([
      'https://codeqlick.com/en/terms',
      'https://codeqlick.com/en/privacy',
      'https://codeqlick.com/en/contact',
    ]);
    expect(citas.every((item) => item.external)).toBe(true);
  });

  it("leaves out the website's legal pages when they don't exist", () => {
    const noLegal = { ...site, legal: false };
    expect(ids('citas', noLegal)).toEqual(['contact']);
    expect(ids('videochat', noLegal)).toEqual(['rules', 'contact']);
    expect(ids('cloud', noLegal)).toEqual(['docs', 'terms', 'report', 'contact']);
    // The 18+ apps' own legal pages are always there.
    expect(ids('cruising', noLegal)).toHaveLength(5);
  });

  it("links the website in its own language from Cruising's other languages", () => {
    const contact = appFooter('cruising', { ...site, locale: 'de' }).at(-1);
    expect(contact?.href).toBe('https://codeqlick.com/en/contact');
  });

  it('gives Cloud its docs (outside when they live apart), terms and abuse report', () => {
    expect(ids('cloud')).toEqual(['docs', 'terms', 'report', 'privacy', 'contact']);
    expect(appFooter('cloud', site)[0]).toMatchObject({ href: '/cloud/docs' });
    const apart = appFooter('cloud', { ...site, docsHref: 'https://docs.example.com/es' });
    expect(apart[0]).toMatchObject({ href: 'https://docs.example.com/es', external: true });
  });

  it('only uses messages that exist', () => {
    for (const app of WEBAPPS) {
      for (const item of appFooter(app, site)) {
        expect(typeof message(item.label), item.label).toBe('string');
      }
    }
    for (const key of ['label', 'copyright']) {
      expect(typeof message(`AppMenu.footer.${key}`), key).toBe('string');
    }
  });
});
