import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { env } from '@/lib/env';
import { webappUrl } from '@/lib/webapp-seo';
import { switcherApps, type Webapp } from '@/lib/webapps';
import styles from './AppSwitcher.module.css';

/**
 * "Apps" menu in each web app's header: the other Codeqlick apps (same account) and the full list
 * on codeqlick.com. A <details> menu, so it works without JavaScript.
 */
export async function AppSwitcher({ current, locale }: { current: Webapp; locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: 'AppSwitcher' });
  const site = env.SITE_URL.replace(/\/$/, '');

  return (
    <details className={styles.switcher}>
      <summary className={styles.toggle} aria-label={t('label')}>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" className={styles.icon}>
          <circle cx="3" cy="3" r="1.6" />
          <circle cx="8" cy="3" r="1.6" />
          <circle cx="13" cy="3" r="1.6" />
          <circle cx="3" cy="8" r="1.6" />
          <circle cx="8" cy="8" r="1.6" />
          <circle cx="13" cy="8" r="1.6" />
          <circle cx="3" cy="13" r="1.6" />
          <circle cx="8" cy="13" r="1.6" />
          <circle cx="13" cy="13" r="1.6" />
        </svg>
        <span className={styles.toggleText}>{t('toggle')}</span>
      </summary>
      <div className={styles.menu}>
        <p className={styles.heading}>{t('heading')}</p>
        <ul className={styles.list}>
          {switcherApps(current).map(({ app, adult }) => (
            <li key={app}>
              <a
                href={webappUrl(app, locale)}
                className={styles.item}
                data-umami-event="app-switcher"
                data-umami-event-from={current}
                data-umami-event-to={app}
              >
                <span className={styles.itemHead}>
                  <span className={styles.itemName}>{t(`apps.${app}.name`)}</span>
                  {adult ? <span className={styles.adult}>+18</span> : null}
                </span>
                <span className={styles.itemBody}>{t(`apps.${app}.body`)}</span>
              </a>
            </li>
          ))}
        </ul>
        <a
          href={`${site}/${locale}/apps`}
          className={styles.all}
          data-umami-event="app-switcher"
          data-umami-event-from={current}
          data-umami-event-to="all"
        >
          {t('all')}
        </a>
      </div>
    </details>
  );
}
