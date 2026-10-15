import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { Logo } from '@/components/brand/Logo';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AuthUser } from '@/lib/api/types';
import { logoutAction } from '@/lib/auth/actions';
import { AppNav, type AppNavItem } from './AppNav';
import { LocaleSwitcher } from './LocaleSwitcher';
import styles from './AppShell.module.css';

/** Dense app layout for the client portal and the admin panel. */
export async function AppShell({
  locale,
  user,
  areaLabel,
  items,
  children,
}: {
  locale: AppLocale;
  user: AuthUser;
  areaLabel: string;
  items: AppNavItem[];
  children: ReactNode;
}) {
  const t = await getTranslations({ locale, namespace: 'App' });
  const tc = await getTranslations({ locale, namespace: 'Common' });

  return (
    <div className={styles.shell}>
      <a className="skip-link" href="#app-main">
        {tc('skipToContent')}
      </a>
      <aside className={styles.sidebar} data-print="hide">
        <div className={styles.brandRow}>
          <Logo href="/" size="sm" label={tc('homeLabel')} />
          <span className={styles.area}>{areaLabel}</span>
        </div>
        <AppNav items={items} label={t('navLabel')} />
        <div className={styles.userBox}>
          <span className={styles.userName}>{t('signedInAs', { name: user.name })}</span>
          <div className={styles.userActions}>
            <LocaleSwitcher />
            <form action={logoutAction}>
              <input type="hidden" name="locale" value={locale} />
              <SubmitButton variant="outline" size="sm">
                {t('logout')}
              </SubmitButton>
            </form>
          </div>
        </div>
      </aside>
      <main id="app-main" className={styles.main}>
        <div className={styles.content}>{children}</div>
      </main>
    </div>
  );
}
