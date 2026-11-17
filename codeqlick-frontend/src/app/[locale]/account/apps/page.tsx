import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/app/PageHeader';
import styles from '@/components/app/app.module.css';
import { Card } from '@/components/ui/Card';
import { resolveCruisingLocale } from '@/i18n/locale';
import { siteLocale } from '@/i18n/routing';
import { accountApps } from '@/lib/api/auth';
import type { AccountApp } from '@/lib/api/types';
import { requireUser } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { webappUrl } from '@/lib/webapp-seo';
import { ADULT_WEBAPPS, WEBAPPS } from '@/lib/webapps';

/** Every part of the platform the person uses, adult apps included, each with its link. */
export default async function AccountAppsPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = resolveCruisingLocale((await params).locale);
  await requireUser(locale);
  const t = await getTranslations({ locale, namespace: 'AccountSite' });
  const tapps = await getTranslations({ locale, namespace: 'AppSwitcher' });
  const { items } = await accountApps();
  const site = siteLocale(locale);

  const describe = (item: AccountApp) => {
    const app = WEBAPPS.find((name) => name === item.app);
    if (app) {
      const appLocale = app === 'cruising' ? locale : site;
      const path = app === 'cloud' ? '/console' : '';
      return {
        name: tapps(`apps.${app}.name`),
        body: tapps(`apps.${app}.body`),
        href: webappUrl(app, appLocale, path),
        adult: ADULT_WEBAPPS.includes(app),
      };
    }
    return {
      name: item.app === 'admin' ? t('apps.admin') : t('apps.portal'),
      body:
        item.app === 'admin' ? t('apps.adminBody') : t('apps.portalBody', { count: item.count }),
      href: `${env.SITE_URL}/${site}/${item.app}`,
      adult: false,
    };
  };

  return (
    <div className={styles.stack}>
      <PageHeader title={t('nav.apps')} lead={t('apps.lead')} />
      {items.length === 0 ? <p className={styles.muted}>{t('apps.none')}</p> : null}
      <ul className={styles.cards}>
        {items.map((item) => {
          const shown = describe(item);
          return (
            <li key={item.app}>
              <Card bordered>
                <h2 className={styles.cardTitle}>
                  <a href={shown.href}>{shown.name}</a>
                  {shown.adult ? ' · +18' : ''}
                </h2>
                <p className={styles.muted}>{shown.body}</p>
              </Card>
            </li>
          );
        })}
      </ul>
      <p>
        <a href={`${env.SITE_URL}/${site}/apps`}>{tapps('all')}</a>
      </p>
    </div>
  );
}
