'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import styles from './Swipe.module.css';

export const REPORT_REASONS = [
  'MINOR',
  'NON_CONSENSUAL',
  'STOLEN',
  'ILLEGAL',
  'HARASSMENT',
  'SPAM',
  'OTHER',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

type ReportFormProps = {
  onSend: (reason: string, details: string) => Promise<void>;
  onCancel: () => void;
  /** Reasons offered (a chat isn't "a stolen photo"). */
  reasons?: readonly ReportReason[];
};

/** Why a photo or a person is reported, with optional details. */
export function ReportForm({ onSend, onCancel, reasons = REPORT_REASONS }: ReportFormProps) {
  const t = useTranslations('Swipe.report');
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [pending, startTransition] = useTransition();

  return (
    <form
      className={styles.reportForm}
      onSubmit={(event) => {
        event.preventDefault();
        if (!reason) return;
        startTransition(() => onSend(reason, details));
      }}
    >
      <p className={styles.reportTitle}>{t('title')}</p>
      <fieldset className={styles.reasons}>
        <legend className={styles.srOnly}>{t('reason')}</legend>
        {reasons.map((value) => (
          <label key={value}>
            <input
              type="radio"
              name="reason"
              value={value}
              checked={reason === value}
              onChange={() => setReason(value)}
            />
            <span>{t(`reasons.${value}`)}</span>
          </label>
        ))}
      </fieldset>
      <label className={styles.detailsLabel}>
        <span>{t('details')}</span>
        <textarea
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          maxLength={1000}
          rows={3}
        />
      </label>
      <p className={styles.hint}>{t('hint')}</p>
      <div className={styles.matchActions}>
        <button type="submit" className={styles.danger} disabled={!reason || pending}>
          {pending ? t('sending') : t('send')}
        </button>
        <button type="button" className={styles.ghost} onClick={onCancel}>
          {t('cancel')}
        </button>
      </div>
    </form>
  );
}
