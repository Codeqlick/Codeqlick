import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/Logo';
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { logoutAction } from '@/lib/auth/actions';
import { getCurrentUser } from '@/lib/auth/session';
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
  };
}

/** The video chat's own frame (videochat.codeqlick.com): dark, no site header or footer. */
export default async function VideochatLayout({ children, params }: LayoutProps) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Videochat' });
  const user = await getCurrentUser();

  return (
    <div className={styles.frame}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <Logo href="/videochat" size="sm" tone="light" label={t('homeLabel')} />
          <span className={styles.brandApp}>{t('brand')}</span>
          <span className={styles.adultBadge}>{t('adultBadge')}</span>
        </div>
        <nav className={styles.headerNav}>
          <Link href="/videochat/rules" className={styles.headerLink}>
            {t('rulesLink')}
          </Link>
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
  );
}
