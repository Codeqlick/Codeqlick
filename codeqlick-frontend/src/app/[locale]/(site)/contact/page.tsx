import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { connection } from 'next/server';
import { Faq } from '@/components/content/Faq';
import { Card } from '@/components/ui/Card';
import { resolveLocale } from '@/i18n/locale';
import { legalOwner } from '@/lib/env';
import { pageMetadata } from '@/lib/seo';
import { CONTACT_EMAIL } from '@/lib/site';
import { Link } from '@/i18n/navigation';
import { getCalculator } from '@/lib/api/calculator';
import { getBookingSlots } from '@/lib/api/bookings';
import { firstParam } from '@/lib/format';
import { ContactForm } from './ContactForm';
import styles from '../site.module.css';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

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

export default async function ContactPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Contact' });
  const renderedAt = await requestTime();
  // Coming from the calculator: the project type and a message with the estimate.
  const query = await searchParams;
  const initial = {
    projectType: firstParam(query.type)?.slice(0, 40),
    message: firstParam(query.message)?.slice(0, 2000),
  };
  const [calculator, booking] = await Promise.all([getCalculator(), getBookingSlots()]);
  const tbook = await getTranslations({ locale, namespace: 'Book' });
  const tcalc = await getTranslations({ locale, namespace: 'Calculator' });

  return (
    <section className={`wrap ${styles.page}`}>
      <p className="eyebrow">{t('eyebrow')}</p>
      <h1 className={styles.title}>{t('title')}</h1>
      <p className={`lead ${styles.lead}`}>{t('lead')}</p>

      <div className={styles.split}>
        <ContactForm renderedAt={renderedAt} showPrivacyNote={!!legalOwner} initial={initial} />
        <Card as="aside" tone="blush">
          <h2 className={styles.itemTitle}>{t('asideTitle')}</h2>
          <p>{t('asideBody')}</p>
          <p>
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </p>
          {booking ? (
            <>
              <h2 className={styles.itemTitle}>{tbook('asideTitle')}</h2>
              <p>
                {tbook('asideBody')} <Link href="/book">{tbook('ctaLink')}</Link>
              </p>
            </>
          ) : null}
          {calculator ? (
            <>
              <h2 className={styles.itemTitle}>{tcalc('asideTitle')}</h2>
              <p>
                {tcalc('asideBody')} <Link href="/calculator">{tcalc('ctaLink')}</Link>
              </p>
            </>
          ) : null}
        </Card>
      </div>

      <div className={styles.contactFaq}>
        <Faq locale={locale} keys={['cost', 'time', 'start', 'response', 'nda']} />
      </div>
    </section>
  );
}
