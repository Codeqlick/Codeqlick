import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Alert } from '@/components/ui/Alert';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resolveLocale } from '@/i18n/locale';
import { getCloudDevice, type CloudDevice } from '@/lib/api/cloud';
import { formatWhen } from '@/lib/cloud';
import { decideDeviceAction } from '../actions';
import styles from '../cloud.module.css';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ code?: string; done?: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Cloud.cli' });
  return { title: t('title'), robots: { index: false, follow: false } };
}

/** `codeqlick login` lands here: the signed-in person checks the code and approves or denies. */
export default async function CloudCliPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const { code: raw, done } = await searchParams;
  const t = await getTranslations({ locale, namespace: 'Cloud.cli' });
  const code = (raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 9);
  const device: CloudDevice | null = code ? await getCloudDevice(code).catch(() => null) : null;

  return (
    <div className={`${styles.landing} ${styles.narrow}`}>
      <div>
        <h1 className={styles.heroTitle}>{t('title')}</h1>
        <p className={styles.muted}>{t('lead')}</p>
      </div>
      {done === 'approved' || device?.status === 'approved' ? (
        <Alert tone="success">{t('approved')}</Alert>
      ) : done === 'denied' || device?.status === 'denied' ? (
        <Alert tone="info">{t('denied')}</Alert>
      ) : !code ? (
        <form method="get" className={`${styles.card} ${styles.form}`}>
          <label htmlFor="code">{t('enter')}</label>
          <input
            id="code"
            name="code"
            className={styles.select}
            autoCapitalize="characters"
            required
          />
          <div className={styles.actions}>
            <SubmitButton>{t('go')}</SubmitButton>
          </div>
        </form>
      ) : !device || done === 'expired' ? (
        <Alert tone="error">{t('expired')}</Alert>
      ) : (
        <div className={styles.card}>
          <p className={styles.small}>{t('code')}</p>
          <p>
            <span className={styles.code}>{device.userCode}</span>
          </p>
          <p className={styles.small}>
            {t('machine')}: <strong>{device.clientName}</strong> ·{' '}
            {t('asked', { when: formatWhen(device.createdAt, locale) })}
          </p>
          <form action={decideDeviceAction} className={styles.actions}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="code" value={device.userCode} />
            <SubmitButton name="decision" value="approve">
              {t('approve')}
            </SubmitButton>
            <SubmitButton name="decision" value="deny" variant="outline">
              {t('deny')}
            </SubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
