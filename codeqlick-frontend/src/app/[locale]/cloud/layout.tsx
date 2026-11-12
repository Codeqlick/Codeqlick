import type { Metadata, Viewport } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { APP_NAMESPACES, ClientMessages } from '@/i18n/ClientMessages';
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
import styles from './cloud.module.css';

type LayoutProps = { children: ReactNode; params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Cloud' });
  const title = t('metaTitle');
  const description = t('metaDescription');
  return {
    // Relative URLs (canonical) resolve on Cloud's own host.
    metadataBase: new URL(webappOrigin('cloud')),
    title: { absolute: title, template: '%s · Codeqlick Cloud' },
    description,
    alternates: webappAlternates('cloud', locale),
    openGraph: {
      type: 'website',
      siteName: 'Codeqlick Cloud',
      title,
      description,
      url: webappPath('cloud', locale),
      locale: locale === 'es' ? 'es_ES' : 'en_US',
    },
  };
}

export const viewport: Viewport = { themeColor: '#ffffff' };

/** Codeqlick Cloud's own frame (cloud.codeqlick.com, architecture 4.13): light colours, no site header. */
export default async function CloudLayout({ children, params }: LayoutProps) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Cloud' });
  const user = await getCurrentUser();
  const webapp = (await requestWebapp()) === 'cloud' ? 'cloud' : null;

  return (
    <ClientMessages extra={APP_NAMESPACES.cloud}>
      <WebappProvider app={webapp}>
        <div className={styles.frame}>
          <header className={styles.header}>
            <div className={styles.brand}>
              <Logo href="/cloud" size="sm" label={t('homeLabel')} />
              <span className={styles.brandApp}>{t('brand')}</span>
            </div>
            <nav className={styles.headerNav}>
              <Link href="/cloud/docs" className={`${styles.headerLink} ${styles.hideSmall}`}>
                {t('nav.docs')}
              </Link>
              {user ? (
                <Link href="/cloud/console" className={`${styles.headerLink} ${styles.hideSmall}`}>
                  {t('nav.console')}
                </Link>
              ) : null}
              <AppSwitcher current="cloud" locale={locale} />
              <LocaleSwitcher className={styles.locale} />
              {user ? (
                <form action={logoutAction}>
                  <input type="hidden" name="locale" value={locale} />
                  <SubmitButton variant="ghost" size="sm" className={styles.signOut}>
                    {t('signOut')}
                  </SubmitButton>
                </form>
              ) : (
                <Link href={`/login?next=/${locale}/cloud/console`} className={styles.headerLink}>
                  {t('signIn')}
                </Link>
              )}
            </nav>
          </header>
          <main className={styles.main}>{children}</main>
          <footer className={styles.footer}>
            <Link href="/cloud/docs">{t('nav.docs')}</Link>
            <Link href="/cloud/terms-of-use">{t('terms.metaTitle')}</Link>
            <Link href="/cloud/report">{t('report.title')}</Link>
          </footer>
        </div>
      </WebappProvider>
    </ClientMessages>
  );
}
