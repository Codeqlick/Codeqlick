import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import {
  SERVICE_SLUGS,
  SERVICES,
  ServiceIcon,
  serviceBySlug,
  type ServiceKey,
} from '@/components/content/services';
import { JsonLd } from '@/components/seo/JsonLd';
import { Button } from '@/components/ui/Button';
import { BASIC_WEBSITE_PRICE, localServiceBySlug, type LocalService } from '@/content/local-seo';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { SITE_LOCALES, type SiteLocale } from '@/i18n/routing';
import { absoluteUrl, pageMetadata } from '@/lib/seo';
import { SITE_NAME } from '@/lib/site';
import site from '../../site.module.css';
import home from '../../page.module.css';
import { ContactCta } from '../ContactCta';
import { CityLinks } from '../LocalLinks';
import styles from '../services.module.css';

type PageProps = { params: Promise<{ locale: string; slug: string }> };

/** The web design hub of the local pages (decision 121): the basic website has no service page. */
const WEB_DESIGN_SLUG = 'web-design';

/** Static content: every service page is built ahead of time, in both languages. */
export function generateStaticParams() {
  return SITE_LOCALES.flatMap((locale) =>
    [...Object.values(SERVICE_SLUGS), WEB_DESIGN_SLUG].map((slug) => ({ locale, slug })),
  );
}

export const dynamicParams = false;

function resolveService(slug: string): ServiceKey {
  const key = serviceBySlug(slug);
  if (!key) notFound();
  return key;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  const locale = resolveLocale(rawLocale);
  if (slug === WEB_DESIGN_SLUG) {
    const t = await getTranslations({ locale, namespace: 'LocalSeo' });
    return pageMetadata({
      locale,
      path: `/services/${slug}`,
      title: t('hubTitle'),
      description: t('hubDescription'),
    });
  }
  const key = resolveService(slug);
  const th = await getTranslations({ locale, namespace: 'Home' });
  return pageMetadata({
    locale,
    path: `/services/${slug}`,
    title: th(`services.items.${key}.title`),
    description: th(`services.items.${key}.body`),
  });
}

/** "Where we work": the service's local pages (decision 121), at the end of its page. */
async function ServiceCities({ locale, service }: { locale: SiteLocale; service: LocalService }) {
  const t = await getTranslations({ locale, namespace: 'LocalSeo' });
  return (
    <div className={`wrap ${styles.localLinks}`}>
      <CityLinks
        locale={locale}
        service={service}
        id="cities-title"
        title={t('citiesTitle')}
        lead={t('citiesLead', { service: service.name[locale] })}
      />
    </div>
  );
}

/** /services/web-design: the basic website in short, its price and its cities. */
async function WebDesignHub({ locale, service }: { locale: SiteLocale; service: LocalService }) {
  const t = await getTranslations({ locale, namespace: 'LocalSeo' });
  const ts = await getTranslations({ locale, namespace: 'Services' });
  const tw = await getTranslations({ locale, namespace: 'BasicWebsite' });
  const included = tw.raw('included') as string[];
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Service',
          name: t('hubTitle'),
          description: t('hubIntro'),
          serviceType: service.name[locale],
          url: absoluteUrl(`/${locale}/services/${service.slug}`),
          areaServed: { '@type': 'Country', name: locale === 'es' ? 'España' : 'Spain' },
          provider: { '@type': 'Organization', name: SITE_NAME, url: absoluteUrl('/') },
          offers: {
            '@type': 'Offer',
            priceCurrency: 'EUR',
            priceSpecification: {
              '@type': 'PriceSpecification',
              minPrice: BASIC_WEBSITE_PRICE,
              priceCurrency: 'EUR',
            },
          },
        }}
      />
      <article>
        <header className={`wrap ${styles.detail}`}>
          <Link href="/services" className={site.back}>
            ← {ts('back')}
          </Link>
          <h1 className={home.title}>{t('hubTitle')}</h1>
          <p className={styles.intro}>{t('hubIntro')}</p>
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
            <p className={styles.price}>{tw('price')}</p>
            <p>{tw('priceNote')}</p>
            <div className={styles.priceActions}>
              <Button href="/basic-website/request">{t('requestWebsite')}</Button>
              <Link href="/basic-website" className={styles.processLink}>
                {t('seeOffer')} →
              </Link>
            </div>
          </section>
        </div>
      </article>
      <ServiceCities locale={locale} service={service} />
      <ContactCta locale={locale} />
    </>
  );
}

export default async function ServicePage({ params }: PageProps) {
  const { locale: rawLocale, slug } = await params;
  const locale = resolveLocale(rawLocale);
  setRequestLocale(locale);
  const localService = localServiceBySlug(slug);
  if (slug === WEB_DESIGN_SLUG && localService) {
    return <WebDesignHub locale={locale} service={localService} />;
  }
  const key = resolveService(slug);
  const t = await getTranslations({ locale, namespace: 'Services' });
  const th = await getTranslations({ locale, namespace: 'Home' });
  const title = th(`services.items.${key}.title`);
  const includes = t.raw(`items.${key}.includes`) as string[];
  const idealFor = t.raw(`items.${key}.idealFor`) as string[];
  const icon = SERVICES.find((service) => service.key === key)?.icon;

  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Service',
          name: title,
          description: t(`items.${key}.intro`),
          serviceType: title,
          url: absoluteUrl(`/${locale}/services/${slug}`),
          areaServed: 'Worldwide',
          provider: { '@type': 'Organization', name: SITE_NAME, url: absoluteUrl('/') },
        }}
      />
      <article>
        <header className={`wrap ${styles.detail}`}>
          <Link href="/services" className={site.back}>
            ← {t('back')}
          </Link>
          {icon ? <ServiceIcon icon={icon} className={styles.icon} /> : null}
          <h1 className={home.title}>{title}</h1>
          <p className={styles.intro}>{t(`items.${key}.intro`)}</p>
        </header>

        <div className={`wrap ${styles.columns}`}>
          <section aria-labelledby="includes-title">
            <h2 id="includes-title" className={styles.columnTitle}>
              {t('includesTitle')}
            </h2>
            <ul className={styles.checks}>
              {includes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="ideal-title">
            <h2 id="ideal-title" className={styles.columnTitle}>
              {t('idealTitle')}
            </h2>
            <ul className={styles.checks}>
              {idealFor.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        </div>

        <div className="wrap">
          <section className={styles.process} aria-labelledby="process-title">
            <h2 id="process-title" className={styles.columnTitle}>
              {t('processTitle')}
            </h2>
            <p>{t('processBody')}</p>
            <Link href="/#process" className={styles.processLink}>
              {t('processLink')} →
            </Link>
          </section>
        </div>
      </article>
      {localService ? <ServiceCities locale={locale} service={localService} /> : null}
      <ContactCta locale={locale} />
    </>
  );
}
