import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { resolveLocale } from '@/i18n/locale';
import { getBookingSlots } from '@/lib/api/bookings';
import { pageMetadata } from '@/lib/seo';
import styles from '../site.module.css';
import { BookingForm } from './BookingForm';

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Book' });
  return pageMetadata({
    locale,
    path: '/book',
    title: t('metaTitle'),
    description: t('metaDescription'),
  });
}

/** Time of this request (rendered per request: the slots change), sent back with the form. */
async function requestTime(): Promise<number> {
  await connection();
  return Date.now();
}

/** Only there once the team publishes it (admin → Llamadas). Rendered per request: slots change. */
export default async function BookPage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const renderedAt = await requestTime();
  const slots = await getBookingSlots();
  if (!slots) notFound();
  const t = await getTranslations({ locale, namespace: 'Book' });

  return (
    <section className={`wrap ${styles.page}`}>
      <p className="eyebrow">{t('eyebrow')}</p>
      <h1 className={styles.title}>{t('title')}</h1>
      <p className={`lead ${styles.lead}`}>{t('lead', { minutes: slots.durationMinutes })}</p>
      <BookingForm slots={slots.slots} renderedAt={renderedAt} />
    </section>
  );
}
