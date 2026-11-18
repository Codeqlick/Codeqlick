import { getTranslations } from 'next-intl/server';
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
};

/**
 * Every web app's header (decision 107): the Codeqlick logo, the app's wordmark, and on the right the
 * ☰ button of the menu drawer (with the person's avatar when signed in).
 */
export async function AppHeader({ app, locale, config, user }: AppHeaderProps) {
  const intl = await getTranslations({ locale });
  const t = (key: string) => intl(`${APP_MESSAGES[app]}.${key}` as never);
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <Logo href={`/${app}`} size="sm" label={t('homeLabel')} />
        <span className={styles.brandApp}>{t('brand')}</span>
      </div>
      <div className={styles.actions}>
        <AppMenu app={app} locale={locale} config={config} user={user} />
      </div>
    </header>
  );
}
