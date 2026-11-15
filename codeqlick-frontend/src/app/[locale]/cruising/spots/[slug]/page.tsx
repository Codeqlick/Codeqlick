import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { cache } from 'react';
import { ReportDetails } from '@/components/cruising/ReportDetails';
import { SpotPresence } from '@/components/cruising/SpotPresence';
import { SpotLocationMap } from '@/components/cruising/SpotLocationMap';
import { SpotReviews } from '@/components/cruising/SpotReviews';
import cruising from '@/components/cruising/Cruising.module.css';
import { JsonLd } from '@/components/seo/JsonLd';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getCruisingSpot, getCruisingStatus, type CruisingStatus } from '@/lib/api/cruising';
import { getCurrentUser } from '@/lib/auth/session';
import { countryName, excerpt, formatRating, mapHref, placeHref, SLUG } from '@/lib/cruising';
import { parsePage } from '@/lib/format';
import { webappAlternates, webappPath, webappUrl } from '@/lib/webapp-seo';
import vc from '../../../videochat/videochat.module.css';

type PageProps = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

const loadSpot = cache(async (slug: string) => (SLUG.test(slug) ? getCruisingSpot(slug) : null));

export async function generateMetadata({ params }: Pick<PageProps, 'params'>): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  const locale = resolveLocale(rawLocale);
  const spot = await loadSpot(slug);
  if (!spot) return {};
  const t = await getTranslations({ locale, namespace: 'Cruising.spot' });
  const title = t('metaTitle', { name: spot.name, city: spot.city });
  const description = excerpt(spot.description);
  const path = `/spots/${spot.slug}`;
  return {
    title,
    description,
    alternates: webappAlternates('cruising', locale, path),
    openGraph: { title, description, url: webappPath('cruising', locale, path) },
  };
}

/** One spot: public information with a small map; reviews and reports for members who entered. */
export default async function CruisingSpotPage({ params, searchParams }: PageProps) {
  const { locale: rawLocale, slug } = await params;
  const locale = resolveLocale(rawLocale);
  const spot = await loadSpot(slug);
  if (!spot) notFound();

  const t = await getTranslations({ locale, namespace: 'Cruising.spot' });
  const tt = await getTranslations({ locale, namespace: 'Cruising.types' });
  const user = await getCurrentUser();
  let status: CruisingStatus | null = null;
  if (user) {
    try {
      status = await getCruisingStatus();
    } catch {
      // The page is public: it still works when Cruising's state can't be read.
    }
  }
  const page = parsePage((await searchParams).page);
  const country = countryName(spot.countryCode, locale);

  return (
    <article>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Place',
          name: spot.name,
          description: excerpt(spot.description, 300),
          url: webappUrl('cruising', locale, `/spots/${spot.slug}`),
          geo: { '@type': 'GeoCoordinates', latitude: spot.lat, longitude: spot.lng },
          address: {
            '@type': 'PostalAddress',
            addressCountry: spot.countryCode,
            addressLocality: spot.city,
          },
        }}
      />
      <nav aria-label={t('breadcrumb')} className={vc.muted}>
        <Link href="/cruising/places" className={vc.inlineLink}>
          {t('places')}
        </Link>
        {' › '}
        <Link href={placeHref(spot.countryCode)} className={vc.inlineLink}>
          {country}
        </Link>
        {' › '}
        <Link href={placeHref(spot.countryCode, spot.citySlug)} className={vc.inlineLink}>
          {spot.city}
        </Link>
      </nav>
      <h1 className={vc.pageTitle}>{spot.name}</h1>
      <p className={cruising.spotMeta}>
        <span className={cruising.typeTag}>{tt(spot.type)}</span>
        <span>
          {spot.city}, {country}
        </span>
        <span>
          {spot.ratingCount > 0
            ? t('rating', { rating: formatRating(spot.ratingAvg), count: spot.ratingCount })
            : t('noRatings')}
        </span>
      </p>

      <div className={cruising.spotLayout}>
        <div>
          <h2 className={vc.sectionTitle}>{t('about')}</h2>
          <p className={cruising.prewrap}>{spot.description}</p>
          {spot.bestTimes ? (
            <>
              <h2 className={vc.sectionTitle}>{t('bestTimes')}</h2>
              <p>{spot.bestTimes}</p>
            </>
          ) : null}
          <div className={vc.warning} role="note">
            <strong>{t('safetyTitle')}.</strong> {t('safety')}{' '}
            <Link href="/cruising/rules" className={vc.inlineLink}>
              {t('rulesLink')}
            </Link>
          </div>
        </div>
        <div>
          <SpotLocationMap
            lat={spot.lat}
            lng={spot.lng}
            name={spot.name}
            type={spot.type}
            label={t('mapLabel', { name: spot.name })}
          />
          <p className={vc.muted}>
            <Link href={mapHref(spot.lat, spot.lng)} className={vc.inlineLink}>
              {t('openMap')}
            </Link>
          </p>
        </div>
      </div>

      {status?.allowed ? <SpotPresence locale={locale} spot={spot} status={status} /> : null}

      <SpotReviews
        locale={locale}
        spot={spot}
        signedIn={user !== null}
        status={status}
        page={page}
      />

      {status?.allowed ? (
        <section className={cruising.section} aria-label={t('reportTitle')}>
          <h2 className={vc.sectionTitle}>{t('reportTitle')}</h2>
          <ReportDetails locale={locale} kind="correction" id={spot.id} />
          <ReportDetails locale={locale} kind="spot" id={spot.id} />
        </section>
      ) : null}
    </article>
  );
}
