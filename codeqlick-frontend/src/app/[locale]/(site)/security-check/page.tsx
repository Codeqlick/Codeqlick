import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { connection } from 'next/server';
import { Card } from '@/components/ui/Card';
import { resolveLocale } from '@/i18n/locale';
import { pageMetadata } from '@/lib/seo';
import { SecurityCheckForm } from './SecurityCheckForm';
import home from '../page.module.css';
import styles from './security-check.module.css';

type PageProps = { params: Promise<{ locale: string }> };

const GROUPS = ['https', 'headers', 'page', 'dnsEmail', 'securityTxt'] as const;
const FAQ = ['safe', 'secure', 'ownership', 'after'] as const;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'SecurityCheck' });
  return pageMetadata({
    locale,
    path: '/security-check',
    title: t('metaTitle'),
    description: t('metaDescription'),
  });
}

/** Time of this request; the form carries it so too-fast submissions are spotted. */
async function requestTime(): Promise<number> {
  await connection();
  return Date.now();
}

/** The free Security check of Codeqlick Security (architecture 4.19): the form and what it reads. */
export default async function SecurityCheckPage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'SecurityCheck' });
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
            <SecurityCheckForm renderedAt={renderedAt} />
          </Card>
          <aside aria-labelledby="groups-title">
            <h2 id="groups-title" className={styles.asideTitle}>
              {t('groupsTitle')}
            </h2>
            <ul className={styles.areas}>
              {GROUPS.map((key) => (
                <li key={key}>
                  <strong>{t(`groups.${key}.title`)}</strong>
                  <span>{t(`groups.${key}.body`)}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
        <p className={styles.note}>{t('passiveNote')}</p>
      </section>

      <section className={home.soft} aria-labelledby="security-faq-title">
        <div className={`wrap ${home.section}`}>
          <h2 id="security-faq-title" className={home.title}>
            {t('faqTitle')}
          </h2>
          <div className={styles.faq}>
            {FAQ.map((key) => (
              <details key={key}>
                <summary>{t(`faq.${key}.question`)}</summary>
                <p>{t(`faq.${key}.answer`)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
