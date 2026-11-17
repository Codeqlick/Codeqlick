'use client';

import { useTranslations } from 'next-intl';
import { reportAction } from '@/app/[locale]/cruising/actions';
import adult from '@/components/adult/adult.module.css';
import { ActionForm, FormSelect, FormTextarea } from '@/components/app/ActionForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AppLocale } from '@/i18n/routing';
import { ROOM_REPORT_REASONS } from '@/lib/cruising-rooms';
import styles from './CruisingRooms.module.css';

/**
 * "Report" under a room message (decision 100): a small form with the reasons a message can be
 * reported for. A client component because the room's messages arrive by polling. The action
 * and the API check the target again.
 */
export function RoomReport({ locale, messageId }: { locale: AppLocale; messageId: string }) {
  const t = useTranslations('Cruising.report');
  const prefix = `report-room-${messageId}`;
  return (
    <details className={styles.report}>
      <summary>{t('open')}</summary>
      <ActionForm
        action={reportAction.bind(null, locale, { kind: 'roomMessage', id: messageId })}
        className={adult.form}
      >
        <p className={adult.muted}>{t('hint')}</p>
        <FormSelect
          name="reason"
          id={`${prefix}-reason`}
          label={t('reason')}
          placeholder={t('reasonPlaceholder')}
          options={ROOM_REPORT_REASONS.map((value) => ({ value, label: t(`reasons.${value}`) }))}
          required
        />
        <FormTextarea
          name="details"
          id={`${prefix}-details`}
          label={t('details')}
          optionalLabel={t('optional')}
          rows={2}
          maxLength={1000}
        />
        <SubmitButton size="sm" variant="outline" pendingLabel={t('sending')}>
          {t('send')}
        </SubmitButton>
      </ActionForm>
    </details>
  );
}
