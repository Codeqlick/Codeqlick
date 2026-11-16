import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Faq } from '@/components/content/Faq';
import { JsonLd } from '@/components/seo/JsonLd';
import { Button } from '@/components/ui/Button';
import {
  cityBySlug,
  localPageDescription,
  localPageFaq,
  localPageIntro,
  localPageJsonLd,
  localPageParams,
  localPageTitle,
  localPriceFrom,
  localServiceBySlug,
} from '@/content/local-seo';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { SITE_LOCALES, type SiteLocale } from '@/i18n/routing';
import { getCalculator } from '@/lib/api/calculator';
import { env } from '@/lib/env';
import { pageMetadata, shareImage } from '@/lib/seo';
import { ContactCta } from '../../ContactCta';
import { CityLinks, ServiceLinks } from '../../LocalLinks';
import styles from '../../services.module.css';
import home from '../../../page.module.css';

type PageProps = { params: Promise<{ locale: string; slug: string; city: string }> };

/** Local service pages (decision 121): every service × city, in both languages, and nothing else. */
export function generateStaticParams() {
  return SITE_LOCALES.flatMap((locale) =>
    localPageParams().map((params) => ({ locale, ...params })),
  );
}

export const dynamicParams = false;

function resolvePage(slug: string, citySlug: string) {
  const service = localServiceBySlug(slug);
  const city = cityBySlug(citySlug);
  if (!service || !city) notFound();
  return { service, city };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: rawLocale, slug, city: citySlug } = await params;
  const locale = resolveLocale(rawLocale);
  const { service, city } = resolvePage(slug, citySlug);
  const title = localPageTitle(locale, service, city);
  const path = `/services/${slug}/${citySlug}`;
  return pageMetadata({
    locale,
    path,
    title,
    description: localPageDescription(locale, service, city),
    images: [shareImage(null, `/${locale}${path}/og`, title)],
  });
}

function formatEuros(amount: number, locale: SiteLocale): string {
  return new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export default async function LocalServicePage({ params }: PageProps) {
  const { locale: rawLocale, slug, city: citySlug } = await params;
  const locale = resolveLocale(rawLocale);
  setRequestLocale(locale);
  const { service, city } = resolvePage(slug, citySlug);
  const t = await getTranslations({ locale, namespace: 'LocalSeo' });
  const ts = await getTranslations({ locale, namespace: 'Services' });
  const tw = await getTranslations({ locale, namespace: 'BasicWebsite' });
  const tn = await getTranslations({ locale, namespace: 'Nav' });
  const calculator = await getCalculator();

  const isWebsite = service.key === 'website';
  const serviceName = service.name[locale];
  const cityName = city.name[locale];
  const price = localPriceFrom(service, calculator);
  const included =
    service.key === 'website'
      ? (tw.raw('included') as string[])
      : (ts.raw(`items.${service.key}.includes`) as string[]);
  const [context, angle] = localPageIntro(locale, service, city);

  return (
    <>
      {localPageJsonLd({
        locale,
        service,
        city,
        siteUrl: env.SITE_URL,
        servicesLabel: tn('services'),
        price,
      }).map((data) => (
        <JsonLd key={String(data['@type'])} data={data} />
      ))}
      <article>
        <header className={`wrap ${styles.detail}`}>
          <nav aria-label={t('breadcrumb')}>
            <ol className={styles.breadcrumb}>
              <li>
                <Link href="/services">{tn('services')}</Link>
              </li>
              <li>
                <Link href={`/services/${service.slug}`}>{serviceName}</Link>
              </li>
              <li aria-current="page">{cityName}</li>
            </ol>
          </nav>
          <h1 className={home.title}>{localPageTitle(locale, service, city)}</h1>
          <p className={styles.intro}>{context}</p>
          <p className={styles.intro}>{angle}</p>
          <p className={styles.remote}>{t('remoteNote', { city: cityName })}</p>
        </header>

        <div className={`wrap ${styles.columns}`}>
          <section aria-labelledby="includes-title">
            <h2 id="includes-title" className={styles.columnTitle}>
              {t('includedTitle')}
            </h2>
            <ul className={styles.checks}>
              {included.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
          <section className={styles.priceBox} aria-labelledby="price-title">
            <h2 id="price-title" className={styles.columnTitle}>
              {t('priceTitle')}
            </h2>
            <p className={styles.price}>
              {price === null
                ? t('priceQuoted')
                : t('priceFrom', { price: formatEuros(price, locale) })}
            </p>
            <p>
              {isWebsite
                ? t('priceNoteWebsite')
                : price === null
                  ? t('priceNoteQuoted')
                  : t('priceNoteCalculator')}
            </p>
            {isWebsite ? (
              <div className={styles.priceActions}>
                <Button href="/basic-website/request">{t('requestWebsite')}</Button>
                <Link href="/basic-website" className={styles.processLink}>
                  {t('seeOffer')} →
                </Link>
              </div>
            ) : calculator ? (
              <Link href="/calculator" className={styles.processLink}>
                {t('calculatorLink')} →
              </Link>
            ) : null}
          </section>
        </div>

        <div className="wrap">
          <section className={styles.process} aria-labelledby="process-title">
            <h2 id="process-title" className={styles.columnTitle}>
              {t('processTitle')}
            </h2>
            <ol className={styles.steps}>
              {service.process[locale].map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>
        </div>

        <div className={`wrap ${home.section}`}>
          <Faq
            locale={locale}
            questions={localPageFaq(locale, service, city)}
            title={t('faqTitle', { service: serviceName, city: cityName })}
          />
        </div>

        <div className={`wrap ${styles.localLinks}`}>
          <CityLinks
            locale={locale}
            service={service}
            except={city}
            id="other-cities-title"
            title={t('otherCitiesTitle', { service: serviceName })}
          />
          <ServiceLinks
            locale={locale}
            city={city}
            except={service}
            id="other-services-title"
            title={t('otherServicesTitle', { city: cityName })}
          />
        </div>
      </article>
      <ContactCta locale={locale} />
    </>
  );
}
