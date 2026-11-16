import { getTranslations } from 'next-intl/server';
import { reportAction } from '@/app/[locale]/cruising/actions';
import vc from '@/app/[locale]/videochat/videochat.module.css';
import { ActionForm, FormSelect, FormTextarea } from '@/components/app/ActionForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AppLocale } from '@/i18n/routing';
import {
  MEDIA_REPORT_REASONS,
  PERSON_REPORT_REASONS,
  PROFILE_REPORT_REASONS,
  REPORT_REASONS,
} from '@/lib/cruising';
import styles from './Cruising.module.css';

type ReportDetailsProps = {
  locale: AppLocale;
  /** What is reported; a `correction` is a report of a spot for wrong information. */
  kind: 'spot' | 'review' | 'correction' | 'profile' | 'conversation' | 'media';
  /** The id of the spot, review, conversation or photo/video, or the nickname of a profile. */
  id: string;
};

/**
 * A "Report" (or "Suggest a correction") that opens a small form, with no JavaScript needed. For
 * members who have entered: the form's action is checked by the API again.
 */
export async function ReportDetails({ locale, kind, id }: ReportDetailsProps) {
  const t = await getTranslations({ locale, namespace: 'Cruising.report' });
  const reasons =
    kind === 'spot' || kind === 'correction'
      ? REPORT_REASONS
      : kind === 'media'
        ? MEDIA_REPORT_REASONS
        : kind === 'profile'
          ? PROFILE_REPORT_REASONS
          : PERSON_REPORT_REASONS;
  const correction = kind === 'correction';
  // Several of these forms share a page: their controls need ids of their own.
  const prefix = `report-${kind}-${id}`;
  return (
    <details className={styles.disclosure}>
      <summary>{correction ? t('correctionOpen') : t('open')}</summary>
      <ActionForm action={reportAction.bind(null, locale, { kind, id })} className={vc.form}>
        {correction ? (
          <p className={vc.muted}>{t('correctionLead')}</p>
        ) : (
          <>
            <p className={vc.muted}>{t('hint')}</p>
            <FormSelect
              name="reason"
              id={`${prefix}-reason`}
              label={t('reason')}
              placeholder={t('reasonPlaceholder')}
              options={reasons.map((value) => ({ value, label: t(`reasons.${value}`) }))}
              required
            />
          </>
        )}
        <FormTextarea
          name="details"
          id={`${prefix}-details`}
          label={correction ? t('correctionDetails') : t('details')}
          hint={correction ? t('correctionHint') : undefined}
          optionalLabel={correction ? undefined : t('optional')}
          rows={3}
          maxLength={1000}
          required={correction}
        />
        <SubmitButton size="sm" variant="outline" pendingLabel={t('sending')}>
          {correction ? t('correctionSend') : t('send')}
        </SubmitButton>
      </ActionForm>
    </details>
  );
}
