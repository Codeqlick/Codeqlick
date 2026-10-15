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
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { routing } from '@/i18n/routing';
import { absoluteUrl, pageMetadata } from '@/lib/seo';
import { SITE_NAME } from '@/lib/site';
import site from '../../site.module.css';
import home from '../../page.module.css';
import { ContactCta } from '../ContactCta';
import styles from '../services.module.css';

type PageProps = { params: Promise<{ locale: string; slug: string }> };

/** Static content: every service page is built ahead of time, in both languages. */
export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    Object.values(SERVICE_SLUGS).map((slug) => ({ locale, slug })),
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
  const key = resolveService(slug);
  const th = await getTranslations({ locale, namespace: 'Home' });
  return pageMetadata({
    locale,
    path: `/services/${slug}`,
    title: th(`services.items.${key}.title`),
    description: th(`services.items.${key}.body`),
  });
}

export default async function ServicePage({ params }: PageProps) {
  const { locale: rawLocale, slug } = await params;
  const locale = resolveLocale(rawLocale);
  setRequestLocale(locale);
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
      <ContactCta locale={locale} />
    </>
  );
}
