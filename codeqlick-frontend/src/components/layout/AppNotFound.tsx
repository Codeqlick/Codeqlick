import { NotFoundContent } from '@/app/[locale]/(site)/NotFoundContent';
import { MenuUnavailable } from '@/components/menu/MenuUnavailable';
import { APP_NAMESPACES, ClientMessages } from '@/i18n/ClientMessages';
import { WebappProvider } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { citasMenu, cloudMenu, meetingsMenu, menuAppMenu } from '@/lib/app-menus';
import { getCurrentUser } from '@/lib/auth/session';
import { cloudDocsUrl } from '@/lib/cloud-docs-url';
import type { Webapp } from '@/lib/webapps';
import { AppFooter } from './AppFooter';
import { AppFrame } from './AppFrame';
import { AppHeader } from './AppHeader';

/** The apps whose frame needs nothing but the session. */
export const NOT_FOUND_APPS = [
  'cloud',
  'citas',
  'meetings',
  'menu',
] as const satisfies readonly Webapp[];
export type NotFoundApp = (typeof NOT_FOUND_APPS)[number];

export function isNotFoundApp(app: Webapp | null): app is NotFoundApp {
  return (NOT_FOUND_APPS as readonly string[]).includes(app ?? '');
}

/**
 * An unknown address on the host of Cloud, Citas, Meetings or Menu: the 404 inside the app's own frame
 * (its header, menu and footer) instead of the website's (architecture 6.6).
 */
export async function AppNotFound({ app, locale }: { app: NotFoundApp; locale: AppLocale }) {
  const user = await getCurrentUser();
  const docsHref = cloudDocsUrl(locale);
  const config =
    app === 'cloud'
      ? cloudMenu(locale, { signedIn: Boolean(user) }, docsHref)
      : app === 'citas'
        ? citasMenu()
        : app === 'menu'
          ? menuAppMenu({ signedIn: Boolean(user) })
          : meetingsMenu();

  return (
    <ClientMessages locale={locale} extra={APP_NAMESPACES[app]}>
      <WebappProvider app={app}>
        <AppFrame
          header={<AppHeader app={app} locale={locale} config={config} user={user} />}
          footer={<AppFooter app={app} locale={locale} docsHref={docsHref} />}
        >
          {app === 'menu' ? (
            // Any unknown address on the menu host reads as a menu that isn't there.
            <MenuUnavailable locale={locale} />
          ) : (
            <NotFoundContent locale={locale} inApp />
          )}
        </AppFrame>
      </WebappProvider>
    </ClientMessages>
  );
}
