import type { Metadata, Viewport } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { APP_NAMESPACES, ClientMessages } from '@/i18n/ClientMessages';
import { Logo } from '@/components/brand/Logo';
import { AppSwitcher } from '@/components/layout/AppSwitcher';
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher';
import { CruisingServiceWorker } from '@/components/cruising/CruisingServiceWorker';
import { NotificationBell } from '@/components/cruising/NotificationBell';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link, WebappProvider } from '@/i18n/navigation';
import { resolveCruisingLocale } from '@/i18n/locale';
import { CRUISING_LOCALES, OG_LOCALES } from '@/i18n/routing';
import { logoutAction } from '@/lib/auth/actions';
import { getCruisingStatus } from '@/lib/api/cruising';
import { listCruisingNotifications } from '@/lib/api/cruising-notifications';
import { notificationsEndpoint } from '@/lib/cruising-notifications';
import { getCurrentUser } from '@/lib/auth/session';
import { requestWebapp } from '@/lib/webapp-request';
import { webappAlternates, webappOrigin, webappPath } from '@/lib/webapp-seo';
import vc from '../videochat/videochat.module.css';

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
    // Indexed like every Codeqlick app; the account-only pages (new, my-spots) opt out.
    robots: { index: true, follow: true, 'max-image-preview': 'large' },
    // Content for adults: Google's label, so SafeSearch filters it as it must.
    other: { rating: 'adult' },
    // The site's Codeqlick favicons, like Swipe and the video chat; the home screen icon is the
    // installed app's own (decision 96), like its manifest's.
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: 'any' },
        { url: '/favicon.svg', type: 'image/svg+xml' },
      ],
      apple: '/cruising-apple-touch-icon.png',
    },
    applicationName: 'Cruising',
    appleWebApp: { capable: true, title: 'Cruising', statusBarStyle: 'default' },
  };
}

export const viewport: Viewport = { themeColor: '#ffffff' };

/** Cruising's own frame (cruising.codeqlick.com): light colours and the Codeqlick logo. */
export default async function CruisingLayout({ children, params }: LayoutProps) {
  const locale = resolveCruisingLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Cruising' });
  const user = await getCurrentUser();
  // Messages and the profile are for members who have entered (and aren't suspended).
  let entered = false;
  if (user) {
    try {
      entered = (await getCruisingStatus()).allowed;
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
        <div className={vc.frame}>
          <header className={vc.header}>
            <div className={vc.brand}>
              <Logo href="/cruising" size="sm" label={t('homeLabel')} />
              <span className={vc.brandApp}>{t('brand')}</span>
              <span className={vc.adultBadge}>{t('adultBadge')}</span>
            </div>
            <nav className={vc.headerNav} aria-label={t('navLabel')}>
              <Link href="/cruising/map" className={vc.headerLink}>
                {t('nav.map')}
              </Link>
              <Link href="/cruising/places" className={vc.headerLink}>
                {t('nav.places')}
              </Link>
              <Link href="/cruising/health" className={vc.headerLink}>
                {t('nav.health')}
              </Link>
              <Link href="/cruising/new" className={vc.headerLink}>
                {t('nav.propose')}
              </Link>
              {user ? (
                <Link href="/cruising/my-spots" className={vc.headerLink}>
                  {t('nav.mySpots')}
                </Link>
              ) : null}
              {entered ? (
                <>
                  <Link href="/cruising/favorites" className={vc.headerLink}>
                    {t('nav.favorites')}
                  </Link>
                  <Link href="/cruising/meetups" className={vc.headerLink}>
                    {t('nav.meetups')}
                  </Link>
                  <Link href="/cruising/rooms" className={vc.headerLink}>
                    {t('nav.rooms')}
                  </Link>
                  <Link href="/cruising/messages" className={vc.headerLink}>
                    {t('nav.messages')}
                  </Link>
                  <Link href="/cruising/me" className={vc.headerLink}>
                    {t('nav.profile')}
                  </Link>
                  <NotificationBell
                    initial={unread}
                    endpoint={notificationsEndpoint(locale, webapp === 'cruising')}
                  />
                </>
              ) : null}
              <Link href="/cruising/rules" className={vc.headerLink}>
                {t('nav.rules')}
              </Link>
              <AppSwitcher current="cruising" locale={locale} />
              <LocaleSwitcher className={vc.locale} locales={CRUISING_LOCALES} />
              {user ? (
                <form action={logoutAction}>
                  <input type="hidden" name="locale" value={locale} />
                  <SubmitButton variant="ghost" size="sm" className={vc.signOut}>
                    {t('signOut')}
                  </SubmitButton>
                </form>
              ) : null}
            </nav>
          </header>
          <main className={vc.main}>{children}</main>
          <footer className={vc.main}>
            <p className={vc.muted}>
              <Link href="/cruising/takedown" className={vc.inlineLink}>
                {t('footerTakedown')}
              </Link>
              {' · '}
              <Link href="/cruising/rules" className={vc.inlineLink}>
                {t('nav.rules')}
              </Link>
              {' · '}
              <Link href="/cruising/terms-of-use" className={vc.inlineLink}>
                {t('legal.terms')}
              </Link>
              {' · '}
              <Link href="/cruising/privacy-policy" className={vc.inlineLink}>
                {t('legal.privacy')}
              </Link>
            </p>
          </footer>
        </div>
      </WebappProvider>
    </ClientMessages>
  );
}
