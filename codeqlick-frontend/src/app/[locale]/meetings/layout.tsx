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
import styles from './meetings.module.css';

type LayoutProps = { children: ReactNode; params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Meetings' });
  return {
    title: { absolute: `${t('metaTitle')} — Codeqlick` },
    description: t('metaDescription'),
    appleWebApp: { capable: true, title: 'Meetings', statusBarStyle: 'default' },
  };
}

export const viewport: Viewport = { themeColor: '#ffffff' };

/** The meetings' own frame (meetings.codeqlick.com): Codeqlick's light colours, no site header. */
export default async function MeetingsLayout({ children, params }: LayoutProps) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Meetings' });
  const user = await getCurrentUser();

  const webapp = (await requestWebapp()) === 'meetings' ? 'meetings' : null;

  return (
    <WebappProvider app={webapp}>
      <div className={styles.frame}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <Logo href="/meetings" size="sm" label={t('homeLabel')} />
            <span className={styles.brandApp}>{t('brand')}</span>
          </div>
          <nav className={styles.headerNav}>
            <AppSwitcher current="meetings" locale={locale} />
            <LocaleSwitcher className={styles.locale} />
            {user ? (
              <form action={logoutAction}>
                <input type="hidden" name="locale" value={locale} />
                <SubmitButton variant="ghost" size="sm" className={styles.signOut}>
                  {t('signOut')}
                </SubmitButton>
              </form>
            ) : (
              <Link href="/login?next=/meetings" className={styles.headerLink}>
                {t('signIn')}
              </Link>
            )}
          </nav>
        </header>
        <main className={styles.main}>{children}</main>
      </div>
    </WebappProvider>
  );
}
