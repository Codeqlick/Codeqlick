import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { connection } from 'next/server';
import { Card } from '@/components/ui/Card';
import { resolveLocale } from '@/i18n/locale';
import { pageMetadata } from '@/lib/seo';
import { WebsiteCheckForm } from './WebsiteCheckForm';
import home from '../page.module.css';
import styles from './website-check.module.css';

type PageProps = { params: Promise<{ locale: string }> };

const AREAS = ['speed', 'mobile', 'seo', 'security'] as const;
const STEPS = ['address', 'check', 'report'] as const;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'WebsiteCheck' });
  return pageMetadata({
    locale,
    path: '/website-check',
    title: t('metaTitle'),
    description: t('metaDescription'),
  });
}

/** Time of this request; the form carries it so too-fast submissions are spotted. */
async function requestTime(): Promise<number> {
  await connection();
  return Date.now();
}

/** The free website check (architecture 4.12): the form and what it looks at. */
export default async function WebsiteCheckPage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'WebsiteCheck' });
  const renderedAt = await requestTime();

  return (
    <>
      <section className={`wrap ${styles.page}`}>
        <div className={home.intro}>
          <p className="eyebrow">{t('eyebrow')}</p>
          <h1 className={home.title}>{t('title')}</h1>
          <p className={home.lead}>{t('lead')}</p>
        </div>
        <div className={styles.split}>
          <Card bordered className={styles.formCard}>
            <WebsiteCheckForm renderedAt={renderedAt} />
          </Card>
          <aside aria-labelledby="areas-title">
            <h2 id="areas-title" className={styles.asideTitle}>
              {t('areasTitle')}
            </h2>
            <ul className={styles.areas}>
              {AREAS.map((key) => (
                <li key={key}>
                  <strong>{t(`areas.${key}.title`)}</strong>
                  <span>{t(`areas.${key}.body`)}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>

      <section className={home.soft} aria-labelledby="check-steps-title">
        <div className={`wrap ${home.section}`}>
          <h2 id="check-steps-title" className={home.title}>
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
    </>
  );
}
