import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { resolveCruisingLocale } from '@/i18n/locale';
import styles from '@/components/cruising/Cruising.module.css';
import { getCruisingPlaces } from '@/lib/api/cruising';
import { countryName, placeHref } from '@/lib/cruising';
import { webappAlternates, webappPath } from '@/lib/webapp-seo';
import vc from '../../videochat/videochat.module.css';

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveCruisingLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Cruising.places' });
  const title = t('metaTitle');
  const description = t('metaDescription');
  return {
    title,
    description,
    alternates: webappAlternates('cruising', locale, '/places'),
    openGraph: { title, description, url: webappPath('cruising', locale, '/places') },
  };
}

/** Countries with spots, and their cities (architecture 4.15: public, LIVE spots only). */
export default async function CruisingPlacesPage({ params }: PageProps) {
  const locale = resolveCruisingLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Cruising.places' });
  const { countries } = await getCruisingPlaces();

  return (
    <>
      <h1 className={vc.pageTitle}>{t('title')}</h1>
      <p className={vc.muted}>{t('lead')}</p>
      {countries.length === 0 ? (
        <p>{t('empty')}</p>
      ) : (
        <ul className={styles.countries}>
          {countries.map((country) => (
            <li key={country.countryCode} className={styles.countryCard}>
              <h2 className={styles.subTitle}>
                <Link href={placeHref(country.countryCode)} className={vc.inlineLink}>
                  {countryName(country.countryCode, locale)}
                </Link>{' '}
                <span className={styles.muted}>({t('spots', { count: country.count })})</span>
              </h2>
              <ul className={styles.cities}>
                {country.cities.map((city) => (
                  <li key={city.citySlug}>
                    <Link
                      href={placeHref(country.countryCode, city.citySlug)}
                      className={vc.inlineLink}
                    >
                      {city.city}
                    </Link>{' '}
                    <span className={styles.muted}>({city.count})</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
