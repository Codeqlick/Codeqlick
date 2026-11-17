import { PageHeader } from '@/components/ui/PageHeader';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { StatusUpdateForm } from '@/components/cloud/StatusUpdateForm';
import { Alert } from '@/components/ui/Alert';
import { resolveLocale } from '@/i18n/locale';
import { firstParam } from '@/lib/format';
import styles from '../cloud.module.css';

export type StatusUpdatePageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
};

type Mode = 'confirm' | 'unsubscribe';

/** Never indexed: they only make sense with an emailed token. */
export async function statusUpdateMetadata(
  mode: Mode,
  { params }: StatusUpdatePageProps,
): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Cloud.statusUpdates' });
  return {
    title: t(mode === 'confirm' ? 'confirmTitle' : 'unsubscribeTitle'),
    robots: { index: false, follow: false },
  };
}

/**
 * Where a status page subscriber's emailed links land (architecture 4.13, decision 105). Opening
 * the page changes nothing: its button confirms or unsubscribes.
 */
export async function StatusUpdatePage(
  mode: Mode,
  { params, searchParams }: StatusUpdatePageProps,
) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Cloud.statusUpdates' });
  const token = firstParam((await searchParams).token)?.trim() ?? '';
  const confirm = mode === 'confirm';

  return (
    <div className={`${styles.landing} ${styles.narrow}`}>
      <PageHeader title={t(confirm ? 'confirmTitle' : 'unsubscribeTitle')} />
      {token ? (
        <>
          <p className={styles.muted}>{t(confirm ? 'confirmLead' : 'unsubscribeLead')}</p>
          <StatusUpdateForm mode={mode} token={token} />
        </>
      ) : (
        <Alert tone="error">{t(confirm ? 'confirmExpired' : 'unsubscribeNotFound')}</Alert>
      )}
    </div>
  );
}
