import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { resolveLocale } from '@/i18n/locale';
import { firstParam } from '@/lib/format';
import styles from '../../site.module.css';
import { CancelForm } from './CancelForm';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Book' });
  return { title: t('cancelTitle'), robots: { index: false, follow: false } };
}

/** From the link in the confirmation email. */
export default async function CancelBookingPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Book' });
  const token = firstParam((await searchParams).token) ?? '';

  return (
    <section className={`wrap ${styles.page}`}>
      <h1 className={styles.title}>{t('cancelTitle')}</h1>
      <p className={`lead ${styles.lead}`}>{t('cancelLead')}</p>
      <CancelForm token={token} />
    </section>
  );
}
