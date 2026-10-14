import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { connection } from 'next/server';
import { Card } from '@/components/ui/Card';
import { resolveLocale } from '@/i18n/locale';
import { pageMetadata } from '@/lib/seo';
import { CONTACT_EMAIL } from '@/lib/site';
import { ContactForm } from './ContactForm';
import styles from '../site.module.css';

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Contact' });
  return pageMetadata({
    locale,
    path: '/contact',
    title: t('metaTitle'),
    description: t('metaDescription'),
  });
}

/** Time of this request; rendered per request so the form carries when it was served. */
async function requestTime(): Promise<number> {
  await connection();
  return Date.now();
}

export default async function ContactPage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Contact' });
  const renderedAt = await requestTime();

  return (
    <section className={`wrap ${styles.page}`}>
      <p className="eyebrow">{t('eyebrow')}</p>
      <h1 className={styles.title}>{t('title')}</h1>
      <p className={`lead ${styles.lead}`}>{t('lead')}</p>

      <div className={styles.split}>
        <ContactForm renderedAt={renderedAt} />
        <Card as="aside" tone="blush">
          <h2 className={styles.itemTitle}>{t('asideTitle')}</h2>
          <p>{t('asideBody')}</p>
          <p>
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </p>
        </Card>
      </div>
    </section>
  );
}
