import { siteLocale } from '@/i18n/routing';
import { appHref, type Webapp } from './webapps';

/**
 * The web apps' menu drawer (architecture 6.3, decision 107): each app's grouped links, as pure
 * builders fed by the layout's state. Labels are message keys (full paths, resolved on the
 * server); hrefs are the app's routes (`/cruising/map`), which `Link` shortens on the app's host.
 */

export type AppMenuItem = {
  id: string;
  href: string;
  /** Full message key, e.g. `Cruising.nav.map`. */
  label: string;
  /** An absolute URL outside the app (a plain `<a>`, never marked as the current page). */
  external?: boolean;
};

export type AppMenuSection = {
  id: string;
  /** Full message key of the small uppercase heading. */
  heading: string;
  items: AppMenuItem[];
};

export type AppMenuConfig = {
  sections: AppMenuSection[];
  /** Links in the footer, before the language switcher (the rules). */
  footer: AppMenuItem[];
  /** Where "Sign in" goes when signed out (`/login?next=…`). */
  signInHref: string;
  /** Where "Create account" goes when signed out. */
  registerHref: string;
  /**
   * The user card's profile button when signed in: the app's own profile page once the person
   * has entered the app ("My profile"), else its entry screen ("Complete your profile"). Null
   * when signed out or when the app has no profile of its own (Meetings, Citas).
   */
  profile: AppMenuItem | null;
};

/**
 * Who is looking: signed in at all, and (Cruising, Swipe, Videochat) entered as a member who isn't
 * suspended and has a profile.
 */
export type MenuState = { signedIn: boolean; entered?: boolean };

type Entry = AppMenuItem & { when?: boolean };

/** The visible items: an entry with `when: false` is left out, the rest lose `when`. */
function items(...entries: Entry[]): AppMenuItem[] {
  return entries.filter((entry) => entry.when !== false).map(({ when: _when, ...item }) => item);
}

/** Sections with no visible item are left out. */
function sections(...list: AppMenuSection[]): AppMenuSection[] {
  return list.filter((section) => section.items.length > 0);
}

const signIn = (locale: string, next: string) =>
  `/login?next=${encodeURIComponent(`/${locale}${next}`)}`;

/** The sign-up page, served as it is on every app's host. */
const REGISTER = '/register';

/**
 * The card's profile button of an 18+ app: its profile page once entered, else its entry screen
 * (the 18+ and rules step) under "Complete your profile".
 */
function adultProfile(
  { signedIn, entered = false }: MenuState,
  profileHref: string,
  entryHref: string,
): AppMenuItem | null {
  if (!signedIn) return null;
  return entered
    ? { id: 'profile', href: profileHref, label: 'AppMenu.card.profile' }
    : { id: 'profile', href: entryHref, label: 'AppMenu.card.completeProfile' };
}

export function cruisingMenu(
  locale: string,
  { signedIn, entered = false }: MenuState,
): AppMenuConfig {
  return {
    sections: sections(
      {
        id: 'discover',
        heading: 'AppMenu.sections.discover',
        items: items(
          { id: 'map', href: '/cruising/map', label: 'Cruising.nav.map' },
          { id: 'places', href: '/cruising/places', label: 'Cruising.nav.places' },
          {
            id: 'meetups',
            href: '/cruising/meetups',
            label: 'Cruising.nav.meetups',
            when: entered,
          },
          { id: 'health', href: '/cruising/health', label: 'Cruising.nav.health' },
        ),
      },
      {
        id: 'community',
        heading: 'AppMenu.sections.community',
        items: items(
          {
            id: 'messages',
            href: '/cruising/messages',
            label: 'Cruising.nav.messages',
            when: entered,
          },
          { id: 'rooms', href: '/cruising/rooms', label: 'Cruising.nav.rooms', when: entered },
          {
            id: 'favorites',
            href: '/cruising/favorites',
            label: 'Cruising.nav.favorites',
            when: entered,
          },
          { id: 'trips', href: '/cruising/trips', label: 'Cruising.nav.trips', when: entered },
          {
            id: 'notifications',
            href: '/cruising/notifications',
            label: 'Cruising.nav.notifications',
            when: entered,
          },
        ),
      },
      {
        id: 'me',
        heading: 'AppMenu.sections.me',
        items: items(
          {
            id: 'my-spots',
            href: '/cruising/my-spots',
            label: 'Cruising.nav.mySpots',
            when: signedIn,
          },
          { id: 'propose', href: '/cruising/new', label: 'Cruising.nav.propose' },
        ),
      },
    ),
    footer: [{ id: 'rules', href: '/cruising/rules', label: 'Cruising.nav.rules' }],
    signInHref: signIn(locale, '/cruising/map'),
    registerHref: REGISTER,
    // `/cruising/me` shows the entry step (date of birth, rules, consent) until it is done.
    profile: adultProfile({ signedIn, entered }, '/cruising/me', '/cruising/me'),
  };
}

export function swipeMenu(locale: string, state: MenuState): AppMenuConfig {
  const { signedIn } = state;
  return {
    sections: sections({
      id: 'swipe',
      heading: 'Swipe.brand',
      items: items(
        { id: 'deck', href: '/swipe/deck', label: 'Swipe.nav.deck', when: signedIn },
        { id: 'matches', href: '/swipe/matches', label: 'Swipe.nav.matches', when: signedIn },
        { id: 'photos', href: '/swipe/photos', label: 'Swipe.nav.photos', when: signedIn },
      ),
    }),
    footer: [{ id: 'rules', href: '/swipe/rules', label: 'Swipe.nav.rules' }],
    signInHref: signIn(locale, '/swipe/deck'),
    registerHref: REGISTER,
    // The profile lives on My photos; the deck shows the entry step and the profile's creation.
    profile: adultProfile(state, '/swipe/photos', '/swipe/deck'),
  };
}

export function videochatMenu(locale: string, state: MenuState): AppMenuConfig {
  const { signedIn } = state;
  return {
    sections: sections({
      id: 'videochat',
      heading: 'Videochat.brand',
      items: items(
        { id: 'home', href: '/videochat', label: 'AppMenu.home' },
        {
          id: 'contacts',
          href: '/videochat/contacts',
          label: 'Videochat.contactsLink',
          when: signedIn,
        },
        {
          id: 'settings',
          href: '/videochat/settings',
          label: 'Videochat.settingsLink',
          when: signedIn,
        },
      ),
    }),
    footer: [{ id: 'rules', href: '/videochat/rules', label: 'Videochat.rulesLink' }],
    signInHref: signIn(locale, '/videochat/room'),
    registerHref: REGISTER,
    // The room shows the entry step (18+ and rules) and the profile until they are done.
    profile: adultProfile(state, '/videochat/settings', '/videochat/room'),
  };
}

export function meetingsMenu(): AppMenuConfig {
  return {
    sections: sections({
      id: 'meetings',
      heading: 'Meetings.brand',
      items: items({ id: 'home', href: '/meetings', label: 'AppMenu.home' }),
    }),
    footer: [],
    // Meetings and Citas keep their sign-in link's route form (the proxy shortens it).
    signInHref: '/login?next=/meetings',
    registerHref: REGISTER,
    profile: null,
  };
}

export function citasMenu(): AppMenuConfig {
  return {
    sections: sections({
      id: 'citas',
      heading: 'Citas.brand',
      items: items({ id: 'home', href: '/citas', label: 'AppMenu.home' }),
    }),
    footer: [],
    signInHref: '/login?next=/citas',
    registerHref: REGISTER,
    profile: null,
  };
}

/** Cloud's docs live on their own site when `CLOUD_DOCS_URL` is set (`docsHref` is then absolute). */
export function cloudMenu(
  locale: string,
  { signedIn }: MenuState,
  docsHref: string,
): AppMenuConfig {
  return {
    sections: sections({
      id: 'cloud',
      heading: 'Cloud.brand',
      items: items(
        { id: 'home', href: '/cloud', label: 'AppMenu.home' },
        {
          id: 'docs',
          href: docsHref,
          label: 'Cloud.nav.docs',
          external: /^https?:/.test(docsHref) || undefined,
        },
        { id: 'console', href: '/cloud/console', label: 'Cloud.nav.console', when: signedIn },
      ),
    }),
    footer: [],
    signInHref: `/login?next=/${locale}/cloud/console`,
    registerHref: REGISTER,
    // Cloud has no profile: the console's home (my teams) is the person's own place.
    profile: signedIn
      ? { id: 'profile', href: '/cloud/console', label: 'Cloud.nav.console' }
      : null,
  };
}

/**
 * Where the card's "My account" goes: the account site (account.codeqlick.com, decision 108) when
 * it is on (`accountOrigin`), else the account page of the website's portal (`/admin/account` for
 * the team). Absolute: those pages live on another host than the app's, in the website's EN/ES.
 */
export function accountSettingsHref(
  locale: string,
  role: 'ADMIN' | 'CLIENT',
  siteUrl: string,
  accountOrigin: string | null,
): string {
  if (accountOrigin) return `${accountOrigin.replace(/\/$/, '')}/${locale}`;
  const area = role === 'ADMIN' ? 'admin' : 'portal';
  return `${siteUrl.replace(/\/$/, '')}/${siteLocale(locale)}/${area}/account`;
}

/**
 * The account site's origin next to `siteUrl` (`https://codeqlick.com` →
 * `https://account.codeqlick.com`) while it is switched on (`ACCOUNT_SSO=true`, decision 108),
 * else null.
 */
export function accountSiteOrigin(siteUrl: string, sso: string | undefined): string | null {
  if (sso !== 'true') return null;
  const url = new URL(siteUrl);
  return `${url.protocol}//account.${url.host.replace(/^www\./, '')}`;
}

/**
 * Whether `href` (an app route) is the page at `pathname` (without the locale, as `usePathname`
 * gives it): on the main host the route itself, on the app's host its short form. The app's home
 * matches only itself; any other link also matches the pages under it.
 */
export function isCurrentPath(pathname: string, href: string, app: Webapp): boolean {
  if (/^https?:/.test(href)) return false;
  const path = href.split(/[?#]/)[0] ?? href;
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const home = path === `/${app}`;
  return [path, appHref(app, path)].some(
    (form) => clean === form || (!home && form !== '/' && clean.startsWith(`${form}/`)),
  );
}

/** What the footer needs besides the app: the website's address and whether its legal pages exist. */
export type AppFooterContext = {
  locale: string;
  /** The website's origin (`https://codeqlick.com`). */
  siteUrl: string;
  /** The website's legal pages exist (`LEGAL_OWNER_NAME` is set). */
  legal: boolean;
  /** Cloud's docs (absolute when `CLOUD_DOCS_URL` is set). */
  docsHref?: string;
};

/**
 * Every web app's footer links (architecture 6.6): its own pages (takedown, rules, terms) as
 * routes, and the website's terms, privacy and contact pages as absolute links in the website's
 * language. The website's legal pages only when they exist.
 */
export function appFooter(
  app: Webapp,
  { locale, siteUrl, legal, docsHref }: AppFooterContext,
): AppMenuItem[] {
  const site = `${siteUrl.replace(/\/$/, '')}/${siteLocale(locale)}`;
  const onSite = (id: string, path: string, label: string, when = true): Entry => ({
    id,
    href: `${site}${path}`,
    label,
    external: true,
    when,
  });
  const siteTerms = onSite('terms', '/terms', 'AppMenu.footer.terms', legal);
  const sitePrivacy = onSite('privacy', '/privacy', 'AppMenu.footer.privacy', legal);
  const contact = onSite('contact', '/contact', 'AppMenu.footer.contact');

  switch (app) {
    case 'cruising':
    case 'swipe': {
      const ns = app === 'cruising' ? 'Cruising' : 'Swipe';
      return items(
        { id: 'takedown', href: `/${app}/takedown`, label: `${ns}.footerTakedown` },
        { id: 'rules', href: `/${app}/rules`, label: `${ns}.nav.rules` },
        { id: 'terms', href: `/${app}/terms-of-use`, label: `${ns}.legal.terms` },
        { id: 'privacy', href: `/${app}/privacy-policy`, label: `${ns}.legal.privacy` },
        contact,
      );
    }
    case 'videochat':
      return items(
        { id: 'rules', href: '/videochat/rules', label: 'Videochat.rulesLink' },
        siteTerms,
        sitePrivacy,
        contact,
      );
    case 'cloud': {
      const docs = docsHref ?? '/cloud/docs';
      return items(
        {
          id: 'docs',
          href: docs,
          label: 'Cloud.nav.docs',
          external: /^https?:/.test(docs) || undefined,
        },
        { id: 'terms', href: '/cloud/terms-of-use', label: 'Cloud.terms.metaTitle' },
        { id: 'report', href: '/cloud/report', label: 'Cloud.report.title' },
        sitePrivacy,
        contact,
      );
    }
    case 'meetings':
    case 'citas':
      return items(siteTerms, sitePrivacy, contact);
  }
}
