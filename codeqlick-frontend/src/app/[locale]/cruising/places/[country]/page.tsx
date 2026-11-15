import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { cache } from 'react';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import styles from '@/components/cruising/Cruising.module.css';
import { getCruisingPlaces } from '@/lib/api/cruising';
import { countryFromParam, countryName, placeHref } from '@/lib/cruising';
import { webappAlternates, webappPath } from '@/lib/webapp-seo';
import vc from '../../../videochat/videochat.module.css';

type PageProps = { params: Promise<{ locale: string; country: string }> };

/** The country's entry in the places list, or null (unknown, or no LIVE spot). */
const loadCountry = cache(async (param: string) => {
  const code = countryFromParam(param);
  if (!code) return null;
  const { countries } = await getCruisingPlaces();
  return countries.find((country) => country.countryCode.toUpperCase() === code) ?? null;
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: rawLocale, country: param } = await params;
  const locale = resolveLocale(rawLocale);
  const country = await loadCountry(param);
  if (!country) return {};
  const t = await getTranslations({ locale, namespace: 'Cruising.places' });
  const name = countryName(country.countryCode, locale);
  const title = t('countryMetaTitle', { country: name });
  const description = t('countryMetaDescription', { country: name, count: country.count });
  const path = `/places/${param.toLowerCase()}`;
  return {
    title,
    description,
    alternates: webappAlternates('cruising', locale, path),
    openGraph: { title, description, url: webappPath('cruising', locale, path) },
  };
}

/** The cities of a country that have spots. */
export default async function CruisingCountryPage({ params }: PageProps) {
  const { locale: rawLocale, country: param } = await params;
  const locale = resolveLocale(rawLocale);
  const country = await loadCountry(param);
  if (!country) notFound();
  const t = await getTranslations({ locale, namespace: 'Cruising.places' });
  const name = countryName(country.countryCode, locale);

  return (
    <>
      <nav aria-label={t('breadcrumb')} className={vc.muted}>
        <Link href="/cruising/places" className={vc.inlineLink}>
          {t('title')}
        </Link>
      </nav>
      <h1 className={vc.pageTitle}>{t('countryTitle', { country: name })}</h1>
      <p className={vc.muted}>{t('spots', { count: country.count })}</p>
      <ul className={styles.cities}>
        {country.cities.map((city) => (
          <li key={city.citySlug}>
            <Link href={placeHref(country.countryCode, city.citySlug)} className={vc.inlineLink}>
              {city.city}
            </Link>{' '}
            <span className={styles.muted}>({t('spots', { count: city.count })})</span>
          </li>
        ))}
      </ul>
    </>
  );
}
