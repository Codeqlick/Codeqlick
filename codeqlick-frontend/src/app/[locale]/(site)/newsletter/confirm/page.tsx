import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { NewsletterSignup } from '@/components/newsletter/NewsletterSignup';
import { Alert } from '@/components/ui/Alert';
import { resolveLocale } from '@/i18n/locale';
import { firstParam } from '@/lib/format';
import { pageMetadata } from '@/lib/seo';
import styles from '../../site.module.css';
import { ConfirmForm } from './ConfirmForm';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Newsletter' });
  return pageMetadata({
    locale,
    path: '/newsletter/confirm',
    title: t('confirmTitle'),
    noindex: true,
  });
}

/**
 * Landing page of the "Confirm your subscription" link (architecture 4.14). Opening it changes
 * nothing: the button confirms, so a mail scanner that opens links can't confirm sign-ups that
 * someone else made.
 */
export default async function ConfirmNewsletterPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Newsletter' });
  const token = firstParam((await searchParams).token)?.trim() ?? '';

  return (
    <section className={`wrap ${styles.page}`}>
      <h1 className={styles.title}>{t('confirmTitle')}</h1>
      {token ? (
        <>
          <p className={`lead ${styles.lead}`}>{t('confirmLead')}</p>
          <div className={styles.listBlock}>
            <ConfirmForm token={token} />
          </div>
        </>
      ) : (
        <>
          <div className={styles.listBlock}>
            <Alert tone="error">{t('confirmExpired')}</Alert>
          </div>
          <NewsletterSignup />
        </>
      )}
    </section>
  );
}
