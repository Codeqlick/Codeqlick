import type { Metadata } from 'next';
import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BASIC_FAQ_KEYS, Faq } from '@/components/content/Faq';
import { Button } from '@/components/ui/Button';
import { resolveLocale } from '@/i18n/locale';
import { pageMetadata } from '@/lib/seo';
import home from '../page.module.css';
import styles from './basic-website.module.css';

type PageProps = { params: Promise<{ locale: string }> };

/** The demos published from the web-basica template (`<key>.demo.codeqlick.com`). */
const DEMOS = ['peluqueria', 'restaurante', 'fisioterapia'] as const;
const STEPS = ['tell', 'preview', 'adjust', 'live'] as const;
/** Until the online request exists (architecture 11.4): the contact form, type preselected. */
const REQUEST_HREF = '/contact?type=web';

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'BasicWebsite' });
  return pageMetadata({
    locale,
    path: '/basic-website',
    title: t('metaTitle'),
    description: t('metaDescription'),
  });
}

export default async function BasicWebsitePage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'BasicWebsite' });
  const included = t.raw('included') as string[];
  const extras = t.raw('extras') as string[];

  return (
    <>
      <header className={`wrap ${styles.header}`}>
        <div className={home.intro}>
          <p className="eyebrow">{t('eyebrow')}</p>
          <h1 className={home.title}>{t('title')}</h1>
          <p className={home.lead}>{t('lead')}</p>
        </div>
        <div className={styles.priceBox}>
          <p className={styles.price}>{t('price')}</p>
          <p className={styles.priceNote}>{t('priceNote')}</p>
          <Button href={REQUEST_HREF} block>
            {t('request')}
          </Button>
          <a href="#demos" className={styles.secondary}>
            {t('seeDemos')}
          </a>
        </div>
      </header>

      <section id="demos" className={home.soft} aria-labelledby="demos-title">
        <div className={`wrap ${home.section}`}>
          <div className={home.intro}>
            <h2 id="demos-title" className={home.title}>
              {t('demosTitle')}
            </h2>
            <p className={home.lead}>{t('demosLead')}</p>
          </div>
          <ul className={styles.demos}>
            {DEMOS.map((key) => (
              <li key={key} className={styles.demo}>
                <Image
                  src={`/demos/${key}.jpg`}
                  alt=""
                  width={1200}
                  height={750}
                  sizes="(max-width: 760px) 100vw, 33vw"
                  className={styles.cover}
                />
                <div className={styles.demoText}>
                  <h3 className={styles.demoName}>{t(`demos.${key}.name`)}</h3>
                  <p className={styles.demoKind}>{t(`demos.${key}.kind`)}</p>
                  <a
                    href={`https://${key}.demo.codeqlick.com`}
                    target="_blank"
                    rel="noopener"
                    className={home.more}
                  >
                    {t('openDemo')}
                    <span className="visually-hidden">
                      {' '}
                      — {t(`demos.${key}.name`)} {t('newTab')}
                    </span>
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={`wrap ${home.section} ${styles.lists}`} aria-label={t('includedTitle')}>
        <div>
          <h2 className={styles.listTitle}>{t('includedTitle')}</h2>
          <ul className={styles.checks}>
            {included.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className={styles.listTitle}>{t('extrasTitle')}</h2>
          <ul className={styles.plus}>
            {extras.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className={home.soft} aria-labelledby="steps-title">
        <div className={`wrap ${home.section}`}>
          <h2 id="steps-title" className={`${home.title} ${styles.stepsTitle}`}>
            {t('stepsTitle')}
          </h2>
          <ol className={home.steps}>
            {STEPS.map((key, index) => (
              <li key={key} className={home.step}>
                <span className={home.stepNumber} aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className={home.stepTitle}>{t(`steps.${key}.title`)}</h3>
                <p className={home.stepBody}>{t(`steps.${key}.body`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <div className={`wrap ${home.section}`}>
        <Faq
          locale={locale}
          keys={BASIC_FAQ_KEYS}
          headingId="basic-faq-title"
          title={t('faqTitle')}
        />
      </div>

      <section className={home.ctaSection} aria-labelledby="cta-title">
        <div className={home.cta}>
          <div className={home.ctaText}>
            <h2 id="cta-title" className={home.ctaTitle}>
              {t('ctaTitle')}
            </h2>
            <p className={home.ctaBody}>{t('ctaBody')}</p>
          </div>
          <div className={home.ctaActions}>
            <Button href={REQUEST_HREF} variant="ink" block>
              {t('request')}
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
