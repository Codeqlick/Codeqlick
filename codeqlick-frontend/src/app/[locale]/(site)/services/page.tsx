import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Faq } from '@/components/content/Faq';
import { SERVICE_SLUGS, SERVICES, ServiceIcon } from '@/components/content/services';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { pageMetadata } from '@/lib/seo';
import home from '../page.module.css';
import { ContactCta } from './ContactCta';
import styles from './services.module.css';

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Services' });
  return pageMetadata({
    locale,
    path: '/services',
    title: t('metaTitle'),
    description: t('metaDescription'),
  });
}

export default async function ServicesPage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Services' });
  const th = await getTranslations({ locale, namespace: 'Home' });

  return (
    <>
      <header className={`wrap ${styles.header}`}>
        <div className={home.intro}>
          <p className="eyebrow">{t('eyebrow')}</p>
          <h1 className={home.title}>{t('title')}</h1>
          <p className={home.lead}>{t('lead')}</p>
        </div>
      </header>

      <div className={home.soft}>
        <div className={`wrap ${home.section}`}>
          <ul className={home.services}>
            {SERVICES.map(({ key, icon }) => (
              <li key={key} className={home.service}>
                <ServiceIcon icon={icon} className={home.icon} />
                <h2 className={home.serviceTitle}>{th(`services.items.${key}.title`)}</h2>
                <p className={home.serviceBody}>{th(`services.items.${key}.body`)}</p>
                <Link href={`/services/${SERVICE_SLUGS[key]}`} className={home.more}>
                  {t('learnMore')}
                  <span className="visually-hidden"> — {th(`services.items.${key}.title`)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className={`wrap ${home.section}`}>
        <Faq locale={locale} />
      </div>
      <ContactCta locale={locale} />
    </>
  );
}
