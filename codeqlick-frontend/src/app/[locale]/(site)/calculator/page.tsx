import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { resolveLocale } from '@/i18n/locale';
import { getCalculator } from '@/lib/api/calculator';
import { pricedTypes } from '@/lib/calculator';
import { pageMetadata } from '@/lib/seo';
import styles from '../site.module.css';
import { Calculator } from './Calculator';

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Calculator' });
  return pageMetadata({
    locale,
    path: '/calculator',
    title: t('metaTitle'),
    description: t('metaDescription'),
  });
}

/** Only there once the team publishes it with prices (admin → Calculadora). */
export default async function CalculatorPage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const config = await getCalculator();
  if (!config || pricedTypes(config).length === 0) notFound();
  const t = await getTranslations({ locale, namespace: 'Calculator' });

  return (
    <section className={`wrap ${styles.page}`}>
      <p className="eyebrow">{t('eyebrow')}</p>
      <h1 className={styles.title}>{t('title')}</h1>
      <p className={`lead ${styles.lead}`}>{t('lead')}</p>
      <Calculator config={config} />
    </section>
  );
}
