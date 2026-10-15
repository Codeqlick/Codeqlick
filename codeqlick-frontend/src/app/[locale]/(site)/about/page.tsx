import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { resolveLocale } from '@/i18n/locale';
import { pageMetadata } from '@/lib/seo';
import home from '../page.module.css';
import { ContactCta } from '../services/ContactCta';
import services from '../services/services.module.css';
import styles from './about.module.css';

const VALUES = ['innovation', 'quality', 'partnership', 'transparency'] as const;
const DIFFERENCES = ['endToEnd', 'product', 'stack', 'iterative'] as const;

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'About' });
  return pageMetadata({
    locale,
    path: '/about',
    title: t('metaTitle'),
    description: t('metaDescription'),
  });
}

/** Who is behind Codeqlick: the company overview of the wiki, for visitors. */
export default async function AboutPage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'About' });

  return (
    <>
      <header className={`wrap ${services.header}`}>
        <div className={home.intro}>
          <p className="eyebrow">{t('eyebrow')}</p>
          <h1 className={home.title}>{t('title')}</h1>
          <p className={home.lead}>{t('lead')}</p>
        </div>
      </header>

      <div className={home.soft}>
        <section
          className={`wrap ${home.section} ${styles.founder}`}
          aria-labelledby="founder-title"
        >
          <div className={home.intro}>
            <p className="eyebrow">{t('founder.eyebrow')}</p>
            <h2 id="founder-title" className={home.title}>
              {t('founder.title')}
            </h2>
          </div>
          <div className={styles.prose}>
            <p>{t('founder.p1')}</p>
            <p>{t('founder.p2')}</p>
          </div>
        </section>
      </div>

      <section className={`wrap ${home.section}`} aria-labelledby="purpose-title">
        <div className={home.intro}>
          <p className="eyebrow">{t('purpose.eyebrow')}</p>
          <h2 id="purpose-title" className={home.title}>
            {t('purpose.title')}
          </h2>
        </div>
        <div className={styles.purpose}>
          <div className={`${home.service} ${styles.card}`}>
            <h3 className={home.serviceTitle}>{t('purpose.mission.title')}</h3>
            <p className={home.serviceBody}>{t('purpose.mission.body')}</p>
          </div>
          <div className={`${home.service} ${styles.card}`}>
            <h3 className={home.serviceTitle}>{t('purpose.vision.title')}</h3>
            <p className={home.serviceBody}>{t('purpose.vision.body')}</p>
          </div>
        </div>
      </section>

      <section className={home.dark} aria-labelledby="values-title">
        <div className={`wrap ${home.why}`}>
          <div className={home.whyIntro}>
            <p className={`eyebrow ${home.eyebrowOnDark}`}>{t('values.eyebrow')}</p>
            <h2 id="values-title" className={home.title}>
              {t('values.title')}
            </h2>
          </div>
          <ul className={home.values}>
            {VALUES.map((key) => (
              <li key={key} className={home.value}>
                <h3 className={home.valueTitle}>{t(`values.items.${key}.title`)}</h3>
                <p>{t(`values.items.${key}.body`)}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={`wrap ${home.section}`} aria-labelledby="different-title">
        <div className={home.intro}>
          <p className="eyebrow">{t('different.eyebrow')}</p>
          <h2 id="different-title" className={home.title}>
            {t('different.title')}
          </h2>
        </div>
        <ul className={home.services}>
          {DIFFERENCES.map((key) => (
            <li key={key} className={`${home.service} ${styles.card}`}>
              <h3 className={home.serviceTitle}>{t(`different.items.${key}.title`)}</h3>
              <p className={home.serviceBody}>{t(`different.items.${key}.body`)}</p>
            </li>
          ))}
        </ul>
      </section>

      <ContactCta locale={locale} />
    </>
  );
}
