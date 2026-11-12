import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ActionForm, FormInput, FormSelect, FormTextarea } from '@/components/app/ActionForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resolveLocale } from '@/i18n/locale';
import { reportAction } from '../actions';
import styles from '../cloud.module.css';

type PageProps = { params: Promise<{ locale: string }> };

const REASONS = ['PHISHING', 'MALWARE', 'ILLEGAL', 'COPYRIGHT', 'SEXUAL', 'SPAM', 'OTHER'] as const;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Cloud.report' });
  return { title: t('metaTitle'), description: t('lead') };
}

/** The public abuse form for pages hosted on Codeqlick Cloud (architecture 4.13, DSA). */
export default async function CloudReportPage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Cloud.report' });

  return (
    <div className={`${styles.landing} ${styles.narrow}`}>
      <div>
        <h1 className={styles.heroTitle}>{t('title')}</h1>
        <p className={styles.muted}>{t('lead')}</p>
      </div>
      <div className={styles.card}>
        <ActionForm action={reportAction.bind(null, locale)} className={styles.form}>
          <FormInput name="url" type="url" label={t('url')} required placeholder="https://" />
          <FormSelect
            name="reason"
            label={t('reason')}
            defaultValue="PHISHING"
            options={REASONS.map((reason) => ({ value: reason, label: t(`reasons.${reason}`) }))}
          />
          <FormTextarea
            name="details"
            label={t('details')}
            hint={t('detailsHint')}
            required
            rows={5}
            maxLength={2000}
          />
          <FormInput
            name="email"
            type="email"
            label={t('email')}
            hint={t('emailHint')}
            required
            autoComplete="email"
          />
          <div className="visually-hidden" aria-hidden="true">
            <label htmlFor="website">Website</label>
            <input id="website" name="website" tabIndex={-1} autoComplete="off" />
          </div>
          <div className={styles.actions}>
            <SubmitButton pendingLabel={t('sending')}>{t('send')}</SubmitButton>
          </div>
        </ActionForm>
      </div>
    </div>
  );
}
