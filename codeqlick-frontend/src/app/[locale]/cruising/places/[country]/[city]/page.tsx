import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { cache } from 'react';
import { Link } from '@/i18n/navigation';
import { resolveCruisingLocale } from '@/i18n/locale';
import { CityCommunity } from '@/components/cruising/CityCommunity';
import styles from '@/components/cruising/Cruising.module.css';
import {
  getCruisingCity,
  getCruisingStatus,
  listCruisingActive,
  type CruisingCity,
  type CruisingStatus,
} from '@/lib/api/cruising';
import { getCurrentUser } from '@/lib/auth/session';
import {
  activeCounts,
  activeSpots,
  countryFromParam,
  countryName,
  formatRating,
  gridBboxAround,
  placeHref,
  SLUG,
  spotHref,
} from '@/lib/cruising';
import { roomHref } from '@/lib/cruising-rooms';
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
  const locale = resolveCruisingLocale(rawLocale);
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

/** Cruising's state of the signed-in person, or null (signed out, or it can't be read). */
async function entryStatus(): Promise<CruisingStatus | null> {
  if (!(await getCurrentUser())) return null;
  try {
    return await getCruisingStatus();
  } catch {
    return null;
  }
}

/**
 * Who is at the city's spots now, for a member who has entered; null for anyone else, and then
 * nothing about presence is asked for (decision 86). Asked for the grid box around the city.
 */
async function cityPresence(
  city: CruisingCity,
  status: CruisingStatus | null,
): Promise<Map<string, number> | null> {
  if (!status?.onboarded) return null;
  try {
    const box = gridBboxAround(city.items);
    if (!box) return new Map();
    const ids = new Set(city.items.map((spot) => spot.id));
    const items = (await listCruisingActive(box)).filter((item) => ids.has(item.spotId));
    return activeCounts([{ items }]);
  } catch {
    // The page is public: it still works when presence can't be read.
    return null;
  }
}

/** The spots of a city, best rated first; for entered members, who is there now. */
export default async function CruisingCityPage({ params }: PageProps) {
  const { locale: rawLocale, country: countryParam, city: citySlug } = await params;
  const locale = resolveCruisingLocale(rawLocale);
  const city = await loadCity(countryParam, citySlug);
  if (!city) notFound();
  const t = await getTranslations({ locale, namespace: 'Cruising.places' });
  const tt = await getTranslations({ locale, namespace: 'Cruising.types' });
  const tm = await getTranslations({ locale, namespace: 'Cruising.spot' });
  const country = countryName(city.countryCode, locale);
  const status = await entryStatus();
  const presence = await cityPresence(city, status);
  const active = presence ? activeSpots(city.items, presence) : [];

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
      {presence ? (
        <section className={styles.activeSection} aria-labelledby="active-now-title">
          <h2 id="active-now-title" className={vc.sectionTitle}>
            {t('activeTitle')}
          </h2>
          {active.length > 0 ? (
            <ul className={styles.activeList}>
              {active.map((spot) => (
                <li key={spot.id}>
                  <Link href={spotHref(spot.slug)} className={vc.inlineLink}>
                    {spot.name}
                  </Link>{' '}
                  <span className={styles.hereBadge}>{t('hereNow', { count: spot.here })}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={vc.muted}>{t('activeNone')}</p>
          )}
        </section>
      ) : null}
      {status?.allowed ? (
        <p>
          <Link href={roomHref(city.countryCode, city.citySlug)} className={vc.inlineLink}>
            {t('roomLink', { city: city.city })}
          </Link>
        </p>
      ) : null}
      {status?.allowed ? (
        <CityCommunity
          locale={locale}
          countryCode={city.countryCode}
          citySlug={city.citySlug}
          city={city.city}
          status={status}
        />
      ) : null}
      <h2 className={vc.sectionTitle}>{t('spotsTitle')}</h2>
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
              {(presence?.get(spot.id) ?? 0) > 0 ? (
                <span className={styles.hereBadge}>
                  {t('hereNow', { count: presence?.get(spot.id) ?? 0 })}
                </span>
              ) : null}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
