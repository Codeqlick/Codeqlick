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
};

/** Who is looking: signed in at all, and (Cruising) entered as a member who isn't suspended. */
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
          { id: 'profile', href: '/cruising/me', label: 'Cruising.nav.profile', when: entered },
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
  };
}

export function swipeMenu(locale: string, { signedIn }: MenuState): AppMenuConfig {
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
  };
}

export function videochatMenu(locale: string, { signedIn }: MenuState): AppMenuConfig {
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
  };
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
