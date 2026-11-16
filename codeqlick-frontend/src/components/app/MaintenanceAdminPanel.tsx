import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { Badge } from '@/components/ui/Badge';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { formatDate } from '@/lib/format';
import type { FormState } from '@/lib/forms';
import { MAINTENANCE_TONES, maintenanceState, type AdminMaintenanceView } from '@/lib/maintenance';
import { ActionForm, FormInput } from './ActionForm';
import styles from './app.module.css';

type FormAction = (previous: FormState, formData: FormData) => Promise<FormState>;

/**
 * A project's maintenance plan in Admin (architecture 8.2, decision 110): its state, Stripe's ids,
 * this month's changes, and "included" for free.
 */
export async function MaintenanceAdminPanel({
  locale,
  plan,
  includeAction,
  removeAction,
}: {
  locale: AppLocale;
  plan: AdminMaintenanceView;
  includeAction: FormAction;
  removeAction: FormAction;
}) {
  const t = await getTranslations({ locale, namespace: 'Maintenance' });
  const state = maintenanceState(plan);
  const paid = plan.status === 'ACTIVE' || plan.status === 'PAST_DUE';
  const facts: Array<[string, string]> = [
    [t('admin.since'), plan.since ? formatDate(plan.since, locale) : '—'],
    [t('admin.periodEnd'), plan.periodEnd ? formatDate(plan.periodEnd, locale) : '—'],
    [
      t('allowanceTitle'),
      t('allowance', { used: plan.allowance.used, limit: plan.allowance.limit }),
    ],
    [t('admin.stripeStatus'), plan.admin.subscriptionStatus ?? '—'],
    [t('admin.customer'), plan.admin.customerId ?? '—'],
    [t('admin.subscription'), plan.admin.subscriptionId ?? '—'],
  ];

  return (
    <div className={styles.stack}>
      <p className={styles.muted}>{t('admin.lead')}</p>
      <p>
        <Badge tone={MAINTENANCE_TONES[state]}>{t(`statusLabels.${state}`)}</Badge>
        {plan.included && plan.includedReason
          ? ` ${t('admin.includedReason', { reason: plan.includedReason })}`
          : null}
      </p>
      {!plan.available ? <p className={styles.muted}>{t('admin.off')}</p> : null}
      <dl className={styles.facts}>
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {plan.included ? (
        <ActionForm action={removeAction}>
          <div className={styles.actions}>
            <SubmitButton variant="outline" size="sm" pendingLabel={t('admin.saving')}>
              {t('admin.removeIncluded')}
            </SubmitButton>
          </div>
        </ActionForm>
      ) : paid ? (
        <p className={styles.muted}>{t('admin.paid')}</p>
      ) : (
        <ActionForm action={includeAction} className={styles.form}>
          <FormInput
            id="maintenance-reason"
            name="reason"
            label={t('admin.reason')}
            hint={t('admin.reasonHint')}
            minLength={3}
            maxLength={300}
            required
          />
          <div className={styles.actions}>
            <SubmitButton size="sm" pendingLabel={t('admin.saving')}>
              {t('admin.markIncluded')}
            </SubmitButton>
          </div>
        </ActionForm>
      )}
    </div>
  );
}
