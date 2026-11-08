'use client';

import { createContext, useContext, useMemo, type ComponentProps, type ReactNode } from 'react';
import { appHref, type Webapp } from '@/lib/webapps';
import { Link as IntlLink, useRouter as useIntlRouter } from './intl-navigation';

/**
 * The web app whose host is serving the page, if any. Its layout provides it, so links written as
 * the app's routes (`/videochat/room`) point to the host's short addresses (`/room`).
 */
const WebappContext = createContext<Webapp | null>(null);

export function WebappProvider({ app, children }: { app: Webapp | null; children: ReactNode }) {
  return <WebappContext.Provider value={app}>{children}</WebappContext.Provider>;
}

type Href = ComponentProps<typeof IntlLink>['href'];

function shorten(app: Webapp | null, href: Href): Href {
  if (!app) return href;
  if (typeof href === 'string') return appHref(app, href);
  if (href.pathname) return { ...href, pathname: appHref(app, href.pathname) };
  return href;
}

/** next-intl's Link, with the app's short addresses on its host. */
export function Link({ href, ...props }: ComponentProps<typeof IntlLink>) {
  const app = useContext(WebappContext);
  return <IntlLink href={shorten(app, href)} {...props} />;
}

/** next-intl's router, with the app's short addresses on its host. */
export function useRouter(): ReturnType<typeof useIntlRouter> {
  const router = useIntlRouter();
  const app = useContext(WebappContext);
  return useMemo(() => {
    if (!app) return router;
    return {
      ...router,
      push: (href, options) => router.push(shorten(app, href) as typeof href, options),
      replace: (href, options) => router.replace(shorten(app, href) as typeof href, options),
      prefetch: (href, options) => router.prefetch(shorten(app, href) as typeof href, options),
    };
  }, [router, app]);
}
