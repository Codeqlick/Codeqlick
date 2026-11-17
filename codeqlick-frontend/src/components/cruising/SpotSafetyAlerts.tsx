import { getTranslations } from 'next-intl/server';
import {
  postSafetyAlertAction,
  voteSafetyAlertAction,
} from '@/app/[locale]/cruising/community-actions';
import adult from '@/components/adult/adult.module.css';
import { ActionForm, FormSelect, FormTextarea } from '@/components/app/ActionForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AppLocale } from '@/i18n/routing';
import type { CruisingSpotPublic, CruisingStatus } from '@/lib/api/cruising';
import { listCruisingSafetyAlerts, type CruisingSafetyAlert } from '@/lib/api/cruising-community';
import { ageOf, SAFETY_KINDS, SAFETY_NOTE_MAX } from '@/lib/cruising-community';
import styles from './CruisingCommunity.module.css';
import { ReportDetails } from './ReportDetails';

type SpotSafetyAlertsProps = {
  locale: AppLocale;
  spot: CruisingSpotPublic;
  status: CruisingStatus;
};

/**
 * A spot's active safety alerts (decision 91) with their age and confirmations, "still there" and
 * "gone", and the form to post one. Who posted an alert is never shown. For members who entered.
 */
export async function SpotSafetyAlerts({ locale, spot, status }: SpotSafetyAlertsProps) {
  const t = await getTranslations({ locale, namespace: 'Cruising.safety' });
  let alerts: CruisingSafetyAlert[] | null = null;
  try {
    alerts = await listCruisingSafetyAlerts(spot.id);
  } catch {
    // The page still works when the alerts can't be read.
  }
  const now = new Date();
  const kinds = SAFETY_KINDS.map((value) => ({ value, label: t(`kinds.${value}`) }));

  return (
    <section className={styles.section} aria-labelledby="spot-safety-title">
      <h2 id="spot-safety-title" className={adult.sectionTitle}>
        {t('title')}
      </h2>
      {alerts === null ? (
        <p className={adult.muted}>{t('loadError')}</p>
      ) : alerts.length === 0 ? (
        <p className={adult.muted}>{t('none')}</p>
      ) : (
        <ul className={styles.list}>
          {alerts.map((alert) => {
            const age = ageOf(alert.createdAt, now);
            return (
              <li key={alert.id} className={styles.alert} role="note">
                <p className={styles.alertKind}>
                  <span aria-hidden="true">⚠</span> {t(`kinds.${alert.kind}`)}
                </p>
                {alert.note ? <p className={styles.prewrap}>{alert.note}</p> : null}
                <p className={styles.meta}>
                  {t(`age.${age.unit}`, { count: age.count })} ·{' '}
                  {t('confirmations', { count: alert.confirmations })}
                  {alert.mine ? ` · ${t('mine')}` : ''}
                </p>
                {status.allowed && !alert.mine && alert.myVote === null ? (
                  <div className={styles.actions}>
                    <ActionForm
                      action={voteSafetyAlertAction.bind(null, locale, alert.id, 'confirm')}
                    >
                      <SubmitButton size="sm" variant="outline" pendingLabel={t('saving')}>
                        {t('confirm')}
                      </SubmitButton>
                    </ActionForm>
                    <ActionForm action={voteSafetyAlertAction.bind(null, locale, alert.id, 'gone')}>
                      <SubmitButton size="sm" variant="outline" pendingLabel={t('saving')}>
                        {t('gone')}
                      </SubmitButton>
                    </ActionForm>
                  </div>
                ) : null}
                {alert.myVote ? (
                  <p className={styles.hint}>
                    {alert.myVote === 'CONFIRM' ? t('youConfirmed') : t('youSaidGone')}
                  </p>
                ) : null}
                {status.allowed && !alert.mine ? (
                  <ReportDetails locale={locale} kind="alert" id={alert.id} />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {status.allowed ? (
        <details className={styles.disclosure}>
          <summary>{t('postOpen')}</summary>
          <ActionForm
            action={postSafetyAlertAction.bind(null, locale, spot.id)}
            className={adult.form}
          >
            <p className={adult.muted}>{t('postLead')}</p>
            <FormSelect
              id="safety-kind"
              name="kind"
              label={t('kind')}
              placeholder={t('kindPlaceholder')}
              options={kinds}
              required
            />
            <FormTextarea
              id="safety-note"
              name="note"
              label={t('note')}
              hint={t('noteHint')}
              optionalLabel={t('optional')}
              rows={2}
              maxLength={SAFETY_NOTE_MAX}
            />
            <SubmitButton pendingLabel={t('posting')}>{t('post')}</SubmitButton>
          </ActionForm>
        </details>
      ) : null}
    </section>
  );
}
