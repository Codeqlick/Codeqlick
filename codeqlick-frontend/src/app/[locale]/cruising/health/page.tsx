import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import cruising from '@/components/cruising/Cruising.module.css';
import styles from '@/components/cruising/CruisingSafety.module.css';
import { HealthCentersMap } from '@/components/cruising/HealthCentersMap';
import { resolveLocale } from '@/i18n/locale';
import { getHealthCenterPlaces, listHealthCenters } from '@/lib/api/cruising-safety';
import { countryName } from '@/lib/cruising';
import { groupCenters, healthAnchor, type HealthCenter } from '@/lib/cruising-safety';
import { webappAlternates, webappPath } from '@/lib/webapp-seo';
import vc from '../../videochat/videochat.module.css';

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'CruisingHealthCenters' });
  const title = t('metaTitle');
  const description = t('metaDescription');
  return {
    title,
    description,
    alternates: webappAlternates('cruising', locale, '/health'),
    openGraph: { title, description, url: webappPath('cruising', locale, '/health') },
  };
}

/**
 * Where to get tested (decision 94): the team's testing centres on a map and listed by country and
 * city. Public and indexed: no personal data is involved.
 */
export default async function CruisingHealthPage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'CruisingHealthCenters' });
  let centers: HealthCenter[] = [];
  let groups: ReturnType<typeof groupCenters> = [];
  let failed = false;
  try {
    const [items, places] = await Promise.all([listHealthCenters(), getHealthCenterPlaces()]);
    centers = items;
    groups = groupCenters(items, places);
  } catch {
    failed = true;
  }

  const features = (center: HealthCenter) =>
    [
      center.free ? t('free') : null,
      center.anonymous ? t('anonymous') : null,
      center.rapid ? t('rapid') : null,
    ].filter((value): value is string => value !== null);

  return (
    <>
      <h1 className={vc.pageTitle}>{t('title')}</h1>
      <p className={vc.muted}>{t('lead')}</p>
      {failed ? (
        <p>{t('loadError')}</p>
      ) : centers.length === 0 ? (
        <p>{t('empty')}</p>
      ) : (
        <>
          <HealthCentersMap centers={centers} label={t('mapLabel')} />
          <nav aria-label={t('jumpLabel')}>
            <ul className={styles.jump}>
              {groups.map((group) => (
                <li key={group.countryCode}>
                  <a href={`#${healthAnchor(group.countryCode)}`} className={vc.inlineLink}>
                    {countryName(group.countryCode, locale)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          {groups.map((group) => (
            <section
              key={group.countryCode}
              id={healthAnchor(group.countryCode)}
              aria-labelledby={`${healthAnchor(group.countryCode)}-title`}
            >
              <h2 id={`${healthAnchor(group.countryCode)}-title`} className={styles.countryTitle}>
                {countryName(group.countryCode, locale)}
              </h2>
              {group.cities.map((city) => (
                <section
                  key={city.citySlug}
                  id={healthAnchor(group.countryCode, city.citySlug)}
                  aria-label={city.city}
                >
                  <h3 className={styles.cityTitle}>
                    {city.city}{' '}
                    <span className={cruising.muted}>
                      ({t('count', { count: city.items.length })})
                    </span>
                  </h3>
                  <ul className={styles.centerList}>
                    {city.items.map((center) => (
                      <li key={center.id} className={styles.centerCard}>
                        <h4>{center.name}</h4>
                        <p>{center.address}</p>
                        {features(center).length > 0 ? (
                          <ul className={cruising.tags} aria-label={t('features')}>
                            {features(center).map((feature) => (
                              <li key={feature} className={cruising.tag}>
                                {feature}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {center.phone ? (
                          <p>
                            {t('phone')}{' '}
                            <a
                              href={`tel:${center.phone.replace(/[^\d+]/g, '')}`}
                              className={vc.inlineLink}
                            >
                              {center.phone}
                            </a>
                          </p>
                        ) : null}
                        {center.url ? (
                          <p>
                            {t('website')}{' '}
                            <a
                              href={center.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={vc.inlineLink}
                            >
                              {new URL(center.url).hostname}
                            </a>
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </section>
          ))}
        </>
      )}
      <p className={cruising.muted}>{t('note')}</p>
    </>
  );
}
