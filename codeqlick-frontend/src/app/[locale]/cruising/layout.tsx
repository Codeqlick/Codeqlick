import type { Metadata, Viewport } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { NEOQLICK_EXOCLICK_VERIFICATION } from '@/lib/neoqlick-exoclick';
import type { ReactNode } from 'react';
import { APP_NAMESPACES, ClientMessages } from '@/i18n/ClientMessages';
import { AppHeader } from '@/components/layout/AppHeader';
import { AppFrame } from '@/components/layout/AppFrame';
import { AppFooter } from '@/components/layout/AppFooter';
import { Button } from '@/components/ui/Button';
import { cruisingMenu } from '@/lib/app-menus';
import { CruisingServiceWorker } from '@/components/cruising/CruisingServiceWorker';
import { NotificationBell } from '@/components/cruising/NotificationBell';
import { WebappProvider } from '@/i18n/navigation';
import { resolveCruisingLocale } from '@/i18n/locale';
import { CRUISING_LOCALES, OG_LOCALES } from '@/i18n/routing';
import { getCruisingStatus } from '@/lib/api/cruising';
import { listCruisingNotifications } from '@/lib/api/cruising-notifications';
import { notificationsEndpoint } from '@/lib/cruising-notifications';
import { getCurrentUser } from '@/lib/auth/session';
import { BRANDS } from '@/lib/brand';
import { requestWebapp } from '@/lib/webapp-request';
import { webappAlternates, webappOrigin, webappPath } from '@/lib/webapp-seo';

type LayoutProps = { children: ReactNode; params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const locale = resolveCruisingLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Cruising' });
  const title = t('metaTitle');
  const description = t('metaDescription');
  const image = {
    url: webappPath('cruising', locale, '/og'),
    width: 1200,
    height: 630,
    alt: title,
  };
  return {
    // Relative URLs (canonical, images) resolve on Cruising's own host.
    metadataBase: new URL(webappOrigin('cruising')),
    title: { absolute: title, template: `%s · ${t('metaSuffix')}` },
    description,
    alternates: webappAlternates('cruising', locale),
    openGraph: {
      type: 'website',
      siteName: t('metaSuffix'),
      title,
      description,
      url: webappPath('cruising', locale),
      locale: OG_LOCALES[locale],
      alternateLocale: CRUISING_LOCALES.filter((l) => l !== locale).map((l) => OG_LOCALES[l]),
      images: [image],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
    // Indexed; the account-only pages (new, my-spots) opt out.
    robots: { index: true, follow: true, 'max-image-preview': 'large' },
    // Content for adults: Google's label, so SafeSearch filters it as it must.
    other: { rating: 'adult', ...NEOQLICK_EXOCLICK_VERIFICATION },
    // Neoqlick's favicons and home screen icon (architecture 4.18).
    icons: BRANDS.neoqlick.icons,
    applicationName: 'Cruising',
    appleWebApp: { capable: true, title: 'Cruising', statusBarStyle: 'default' },
  };
}

export const viewport: Viewport = { themeColor: '#ffffff' };

/** Cruising's own frame (cruising.neoqlick.com): light colours and the Neoqlick logo. */
export default async function CruisingLayout({ children, params }: LayoutProps) {
  const locale = resolveCruisingLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Cruising' });
  const user = await getCurrentUser();
  // Messages and the profile are for members who have entered (and aren't suspended).
  let entered = false;
  let verified = false;
  if (user) {
    try {
      const status = await getCruisingStatus();
      entered = status.allowed;
      verified = status.verified;
    } catch {
      // The frame still works when Cruising's state can't be read.
    }
  }

  const webapp = (await requestWebapp()) === 'cruising' ? 'cruising' : null;
  // The bell's first count is rendered here; it asks again every minute (decision 98).
  const unread = entered
    ? await listCruisingNotifications()
        .then((centre) => centre.unread)
        .catch(() => 0)
    : 0;

  return (
    <ClientMessages extra={APP_NAMESPACES.cruising}>
      <WebappProvider app={webapp}>
        {/* The offline page and the app shell (decision 96), on Cruising's own host only. */}
        {webapp ? <CruisingServiceWorker /> : null}
        <AppFrame
          header={
            <AppHeader
              app="cruising"
              locale={locale}
              config={cruisingMenu(locale, { signedIn: Boolean(user), entered })}
              user={user}
              verified={verified}
              adult
              locales={CRUISING_LOCALES}
              action={
                <Button href="/cruising/new" size="sm">
                  {t('nav.propose')}
                </Button>
              }
              bell={
                entered ? (
                  <NotificationBell
                    initial={unread}
                    endpoint={notificationsEndpoint(locale, webapp === 'cruising')}
                  />
                ) : null
              }
            />
          }
          footer={<AppFooter app="cruising" locale={locale} />}
        >
          {children}
        </AppFrame>
      </WebappProvider>
    </ClientMessages>
  );
}
