import { describe, expect, it } from 'vitest';
import en from '../messages/en.json';
import {
  accountSettingsHref,
  accountSiteOrigin,
  appFooter,
  citasMenu,
  cloudMenu,
  isCurrentPath,
  meetingsMenu,
  menuAppMenu,
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

describe('the apps', () => {
  it('Meetings and Citas: their home and their sign-in link', () => {
    expect(shape(meetingsMenu())).toEqual({ meetings: ['home'] });
    expect(meetingsMenu().signInHref).toBe('/login?next=/meetings');
    expect(shape(citasMenu())).toEqual({ citas: ['home'] });
    expect(citasMenu().signInHref).toBe('/login?next=/citas');
  });

  it('Menu: its home, and a new menu when signed in', () => {
    expect(shape(menuAppMenu({ signedIn: false }))).toEqual({ menu: ['home'] });
    expect(shape(menuAppMenu({ signedIn: true }))).toEqual({ menu: ['home', 'new'] });
    expect(menuAppMenu({ signedIn: false }).signInHref).toBe('/login?next=/menu');
    expect(menuAppMenu({ signedIn: true }).profile).toBeNull();
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
      meetingsMenu(),
      citasMenu(),
      menuAppMenu({ signedIn: true }),
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
      cloudMenu('es', { signedIn: false }, '/cloud/docs'),
      meetingsMenu(),
      citasMenu(),
    ]) {
      expect(config.profile).toBeNull();
      expect(config.registerHref).toBe('/register');
      expect(config.signInHref).toMatch(/^\/login\?next=/);
    }
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
    const origin = accountSiteOrigin(site, 'true');
    expect(origin).toBe('https://account.codeqlick.com');
    expect(accountSettingsHref('es', 'ADMIN', site, origin)).toBe(
      'https://account.codeqlick.com/es',
    );
    expect(accountSiteOrigin('https://www.codeqlick.com', 'true')).toBe(
      'https://account.codeqlick.com',
    );
    expect(accountSiteOrigin(site, undefined)).toBeNull();
    expect(accountSiteOrigin(site, 'false')).toBeNull();
  });

  it('only uses messages that exist', () => {
    for (const key of ['openFor', 'label', 'account', 'register']) {
      const path = key === 'openFor' ? `AppMenu.${key}` : `AppMenu.card.${key}`;
      expect(typeof message(path), path).toBe('string');
    }
  });
});

describe('isCurrentPath', () => {
  it('matches the route on the main host and the short address on the app host', () => {
    expect(isCurrentPath('/cloud/console', '/cloud/console', 'cloud')).toBe(true);
    expect(isCurrentPath('/console', '/cloud/console', 'cloud')).toBe(true);
    expect(isCurrentPath('/console/', '/cloud/console', 'cloud')).toBe(true);
    expect(isCurrentPath('/docs', '/cloud/console', 'cloud')).toBe(false);
  });

  it('marks a section for the pages under it', () => {
    expect(isCurrentPath('/console/acme', '/cloud/console', 'cloud')).toBe(true);
    expect(isCurrentPath('/cloud/console/acme/site', '/cloud/console', 'cloud')).toBe(true);
    expect(isCurrentPath('/consolex', '/cloud/console', 'cloud')).toBe(false);
  });

  it("marks the app's home only on the home itself", () => {
    expect(isCurrentPath('/', '/cloud', 'cloud')).toBe(true);
    expect(isCurrentPath('/cloud', '/cloud', 'cloud')).toBe(true);
    expect(isCurrentPath('/docs', '/cloud', 'cloud')).toBe(false);
    expect(isCurrentPath('/cloud/docs', '/cloud', 'cloud')).toBe(false);
  });

  it('never marks an outside link', () => {
    expect(isCurrentPath('/docs', 'https://docs.example.com/docs', 'cloud')).toBe(false);
  });
});

describe('appFooter', () => {
  const site = { locale: 'es', siteUrl: 'https://codeqlick.com/', legal: true };
  const ids = (app: Webapp, context = site) => appFooter(app, context).map((item) => item.id);

  it("links Meetings and Citas to the website's legal pages and contact", () => {
    expect(ids('meetings')).toEqual(['terms', 'privacy', 'contact']);
    expect(ids('menu')).toEqual(['terms', 'privacy', 'contact']);
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
    expect(ids('cloud', noLegal)).toEqual(['docs', 'terms', 'report', 'contact']);
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
