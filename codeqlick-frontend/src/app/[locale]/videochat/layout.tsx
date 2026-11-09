import type { Metadata, Viewport } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/Logo';
import { AppSwitcher } from '@/components/layout/AppSwitcher';
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link, WebappProvider } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { logoutAction } from '@/lib/auth/actions';
import { getCurrentUser } from '@/lib/auth/session';
import { requestWebapp } from '@/lib/webapp-request';
import { webappAlternates, webappOrigin, webappPath } from '@/lib/webapp-seo';
import styles from './videochat.module.css';

type LayoutProps = { children: ReactNode; params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Videochat' });
  const title = t('metaTitle');
  const description = t('metaDescription');
  const image = {
    url: webappPath('videochat', locale, '/og'),
    width: 1200,
    height: 630,
    alt: title,
  };
  return {
    // Relative URLs (canonical, images) resolve on the video chat's own host.
    metadataBase: new URL(webappOrigin('videochat')),
    title: { absolute: title, template: `%s · ${t('metaSuffix')}` },
    description,
    alternates: webappAlternates('videochat', locale),
    openGraph: {
      type: 'website',
      siteName: t('metaSuffix'),
      title,
      description,
      url: webappPath('videochat', locale),
      locale: locale === 'es' ? 'es_ES' : 'en_US',
      images: [image],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
    // Public pages are indexed; the account-only ones (room, contacts, settings) opt out.
    robots: { index: true, follow: true, 'max-image-preview': 'large' },
    other: {
      // Sexual content between adults: Google's label, so SafeSearch filters it as it must.
      rating: 'adult',
      // `other` replaces the root layout's: ExoClick's ownership check stays (architecture 4.7).
      '6a97888e-site-verification': '5e55aa28a6c9210038f92e69880e6449',
      // Google Search Console's ownership check (property https://videochat.codeqlick.com).
      'google-site-verification': '_A3wQZIogBMzJQNEVq_--g1xi9eYTwtYVMRBFwH5kZU',
    },
    // Installed on a phone it opens as its own app (manifest: app/manifest.ts on this host).
    appleWebApp: { capable: true, title: 'Videochat', statusBarStyle: 'default' },
  };
}

export const viewport: Viewport = { themeColor: '#ffffff' };

/** The video chat's own frame (videochat.codeqlick.com): Codeqlick's light colours, no site header or footer. */
export default async function VideochatLayout({ children, params }: LayoutProps) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Videochat' });
  const user = await getCurrentUser();

  const webapp = (await requestWebapp()) === 'videochat' ? 'videochat' : null;

  return (
    <WebappProvider app={webapp}>
      <div className={styles.frame}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <Logo href="/videochat" size="sm" label={t('homeLabel')} />
            <span className={styles.brandApp}>{t('brand')}</span>
            <span className={styles.adultBadge}>{t('adultBadge')}</span>
          </div>
          <nav className={styles.headerNav}>
            <Link href="/videochat/rules" className={styles.headerLink}>
              {t('rulesLink')}
            </Link>
            {user ? (
              <Link href="/videochat/contacts" className={styles.headerLink}>
                {t('contactsLink')}
              </Link>
            ) : null}
            {user ? (
              <Link href="/videochat/settings" className={styles.headerLink}>
                {t('settingsLink')}
              </Link>
            ) : null}
            <AppSwitcher current="videochat" locale={locale} />
            <LocaleSwitcher className={styles.locale} />
            {user ? (
              <form action={logoutAction}>
                <input type="hidden" name="locale" value={locale} />
                <SubmitButton variant="ghost" size="sm" className={styles.signOut}>
                  {t('signOut')}
                </SubmitButton>
              </form>
            ) : null}
          </nav>
        </header>
        <main className={styles.main}>{children}</main>
      </div>
    </WebappProvider>
  );
}
