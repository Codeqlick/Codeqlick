import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Alert } from '@/components/ui/Alert';
import { resolveLocale } from '@/i18n/locale';
import { firstParam } from '@/lib/format';
import { pageMetadata } from '@/lib/seo';
import styles from '../../site.module.css';
import { UnsubscribeForm } from './UnsubscribeForm';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Newsletter' });
  return pageMetadata({
    locale,
    path: '/newsletter/unsubscribe',
    title: t('unsubscribeTitle'),
    noindex: true,
  });
}

/** From the link in every newsletter email. Opening it changes nothing: the button does. */
export default async function UnsubscribePage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Newsletter' });
  const token = firstParam((await searchParams).token)?.trim() ?? '';

  return (
    <section className={`wrap ${styles.page}`}>
      <h1 className={styles.title}>{t('unsubscribeTitle')}</h1>
      {token ? (
        <>
          <p className={`lead ${styles.lead}`}>{t('unsubscribeLead')}</p>
          <div className={styles.listBlock}>
            <UnsubscribeForm token={token} />
          </div>
        </>
      ) : (
        <div className={styles.listBlock}>
          <Alert tone="error">{t('unsubscribeNotFound')}</Alert>
        </div>
      )}
    </section>
  );
}
