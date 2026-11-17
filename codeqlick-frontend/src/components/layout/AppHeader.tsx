import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/Logo';
import type { AppLocale } from '@/i18n/routing';
import type { AuthUser } from '@/lib/api/types';
import type { AppMenuConfig } from '@/lib/app-menus';
import type { Webapp } from '@/lib/webapps';
import { APP_MESSAGES, AppMenu } from './AppMenu';
import styles from './AppMenu.module.css';

type AppHeaderProps = {
  app: Webapp;
  locale: AppLocale;
  config: AppMenuConfig;
  /** The signed-in person (the menu's avatar and user card), or null. */
  user: AuthUser | null;
  /** The app's "verified" badge on the user card (Cruising, Swipe, Videochat). */
  verified?: boolean;
  /** The "18+" badge next to the wordmark (Videochat, Swipe, Cruising). */
  adult?: boolean;
  /** The app's call to action, shown from 40rem up (Cruising's "Propose a spot"). */
  action?: ReactNode;
  /** The notification bell (Cruising, for entered members). */
  bell?: ReactNode;
  locales?: readonly AppLocale[];
};

/**
 * Every web app's header (decision 107): the Codeqlick logo, the app's wordmark and badge, and on
 * the right only its call to action, its bell and the ☰ button of the menu drawer (with the
 * person's avatar when signed in).
 */
export async function AppHeader({
  app,
  locale,
  config,
  user,
  verified,
  adult = false,
  action,
  bell,
  locales,
}: AppHeaderProps) {
  const intl = await getTranslations({ locale });
  const t = (key: string) => intl(`${APP_MESSAGES[app]}.${key}` as never);
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <Logo href={`/${app}`} size="sm" label={t('homeLabel')} />
        <span className={styles.brandApp}>{t('brand')}</span>
        {adult ? <span className={styles.adultBadge}>{t('adultBadge')}</span> : null}
      </div>
      <div className={styles.actions}>
        {action ? <div className={styles.action}>{action}</div> : null}
        {bell}
        <AppMenu
          app={app}
          locale={locale}
          config={config}
          user={user}
          verified={verified}
          locales={locales}
        />
      </div>
    </header>
  );
}
