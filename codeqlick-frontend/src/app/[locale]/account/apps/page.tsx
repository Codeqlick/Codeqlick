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
import { portalUrl } from '@/lib/portal-links';
import { requestBrand } from '@/lib/request-brand';
import { webappUrl } from '@/lib/webapp-seo';
import { appsOfBrand } from '@/lib/webapps';

/** Every part of the platform the person uses on this brand, each with its link. */
export default async function AccountAppsPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = resolveCruisingLocale((await params).locale);
  await requireUser(locale);
  const t = await getTranslations({ locale, namespace: 'AccountSite' });
  const tapps = await getTranslations({ locale, namespace: 'AppSwitcher' });
  const brandApps: readonly string[] = appsOfBrand(await requestBrand());
  const { items: all } = await accountApps();
  // The 18+ apps are Neoqlick's: a Codeqlick account never lists them (architecture 4.18).
  const items = all.filter(
    (item) => item.app === 'admin' || item.app === 'portal' || brandApps.includes(item.app),
  );
  const brand = await requestBrand();
  const neoqlick = brand === 'neoqlick';
  const site = neoqlick ? locale : siteLocale(locale);

  const describe = (item: AccountApp) => {
    const app = appsOfBrand(brand).find((name) => name === item.app);
    if (app) {
      const appLocale = app === 'cruising' ? locale : siteLocale(locale);
      const path = app === 'cloud' ? '/console' : '';
      return {
        name: tapps(`apps.${app}.name`),
        body: tapps(`apps.${app}.body`),
        href: webappUrl(app, appLocale, path),
      };
    }
    return {
      name: item.app === 'admin' ? t('apps.admin') : t('apps.portal'),
      body:
        item.app === 'admin' ? t('apps.adminBody') : t('apps.portalBody', { count: item.count }),
      href: `${env.SITE_URL}/${site}/${item.app}`,
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
                </h2>
                <p className={styles.muted}>{shown.body}</p>
              </Card>
            </li>
          );
        })}
      </ul>
      <p>
        <a href={neoqlick ? portalUrl(locale) : `${env.SITE_URL}/${site}/apps`}>{tapps('all')}</a>
      </p>
    </div>
  );
}
