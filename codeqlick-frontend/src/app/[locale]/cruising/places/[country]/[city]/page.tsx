import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { cache } from 'react';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import styles from '@/components/cruising/Cruising.module.css';
import { getCruisingCity } from '@/lib/api/cruising';
import {
  countryFromParam,
  countryName,
  formatRating,
  placeHref,
  SLUG,
  spotHref,
} from '@/lib/cruising';
import { webappAlternates, webappPath } from '@/lib/webapp-seo';
import vc from '../../../../videochat/videochat.module.css';

type PageProps = { params: Promise<{ locale: string; country: string; city: string }> };

const loadCity = cache(async (countryParam: string, citySlug: string) => {
  const code = countryFromParam(countryParam);
  if (!code || !SLUG.test(citySlug)) return null;
  return getCruisingCity(code, citySlug);
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: rawLocale, country: countryParam, city: citySlug } = await params;
  const locale = resolveLocale(rawLocale);
  const city = await loadCity(countryParam, citySlug);
  if (!city) return {};
  const t = await getTranslations({ locale, namespace: 'Cruising.places' });
  const country = countryName(city.countryCode, locale);
  const title = t('cityMetaTitle', { city: city.city, country });
  const description = t('cityMetaDescription', {
    city: city.city,
    country,
    count: city.items.length,
  });
  const path = `/places/${countryParam.toLowerCase()}/${city.citySlug}`;
  return {
    title,
    description,
    alternates: webappAlternates('cruising', locale, path),
    openGraph: { title, description, url: webappPath('cruising', locale, path) },
  };
}

/** The spots of a city, best rated first. */
export default async function CruisingCityPage({ params }: PageProps) {
  const { locale: rawLocale, country: countryParam, city: citySlug } = await params;
  const locale = resolveLocale(rawLocale);
  const city = await loadCity(countryParam, citySlug);
  if (!city) notFound();
  const t = await getTranslations({ locale, namespace: 'Cruising.places' });
  const tt = await getTranslations({ locale, namespace: 'Cruising.types' });
  const tm = await getTranslations({ locale, namespace: 'Cruising.spot' });
  const country = countryName(city.countryCode, locale);

  return (
    <>
      <nav aria-label={t('breadcrumb')} className={vc.muted}>
        <Link href="/cruising/places" className={vc.inlineLink}>
          {t('title')}
        </Link>
        {' › '}
        <Link href={placeHref(city.countryCode)} className={vc.inlineLink}>
          {country}
        </Link>
      </nav>
      <h1 className={vc.pageTitle}>{t('cityTitle', { city: city.city, country })}</h1>
      <p className={vc.muted}>{t('spots', { count: city.items.length })}</p>
      <ul className={styles.spotList}>
        {city.items.map((spot) => (
          <li key={spot.id} className={styles.spotCard}>
            <h2 className={styles.subTitle}>
              <Link href={spotHref(spot.slug)} className={vc.inlineLink}>
                {spot.name}
              </Link>
            </h2>
            <p className={styles.spotMeta}>
              <span className={styles.typeTag}>{tt(spot.type)}</span>
              <span>
                {spot.ratingCount > 0
                  ? tm('rating', { rating: formatRating(spot.ratingAvg), count: spot.ratingCount })
                  : tm('noRatings')}
              </span>
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
