import type { Metadata, Viewport } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/Logo';
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link, WebappProvider } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { logoutAction } from '@/lib/auth/actions';
import { getCurrentUser } from '@/lib/auth/session';
import { requestWebapp } from '@/lib/webapp-request';
import styles from './videochat.module.css';

type LayoutProps = { children: ReactNode; params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Videochat' });
  return {
    title: { absolute: `${t('metaTitle')} — Codeqlick` },
    description: t('metaDescription'),
    // Adult content: kept out of search results.
    robots: { index: false, follow: false },
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
