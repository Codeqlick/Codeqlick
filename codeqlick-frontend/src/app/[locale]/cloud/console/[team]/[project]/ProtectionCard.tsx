import { getTranslations } from 'next-intl/server';
import { ActionForm, FormInput, FormRadioGroup, FormSelect } from '@/components/app/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AppLocale } from '@/i18n/routing';
import { getCloudProtection } from '@/lib/api/cloud';
import { formatWhen, PROTECTION_DAYS, PROTECTION_MODES } from '@/lib/cloud';
import { saveProtectionAction } from '../../../actions';
import styles from '../../../cloud.module.css';

type Props = {
  locale: AppLocale;
  projectId: string;
  path: string;
  admin: boolean;
};

/** A padlock shown next to an address that asks for the project's password. */
export function ProtectionLock({ label }: { label: string }) {
  return (
    <span className={styles.lock} title={label}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
      <span className="visually-hidden">{label}</span>
    </span>
  );
}

/**
 * The project's password protection (architecture 4.13): off, the previews, or the previews and
 * production. Admins change it; members see the state.
 */
export async function ProtectionCard(props: Props) {
  const t = await getTranslations({ locale: props.locale, namespace: 'Cloud' });
  const protection = await getCloudProtection(props.projectId).catch(() => null);
  return (
    <section className={`${styles.card} ${styles.narrow}`} aria-labelledby="protection-title">
      <h2 id="protection-title" className={styles.cardTitle}>
        {t('protection.title')}
      </h2>
      <p className={styles.muted}>{t('protection.lead')}</p>
      {protection === null ? (
        <p className={styles.muted}>{t('common.loadError')}</p>
      ) : (
        <>
          <p className={styles.rowTitle}>
            <Badge tone={protection.mode === 'OFF' ? 'neutral' : 'success'}>
              {t(`protection.modes.${protection.mode}`)}
            </Badge>
            {protection.mode === 'OFF' ? null : (
              <span className={styles.small}>
                {t('protection.daysValue', { count: protection.days })}
              </span>
            )}
          </p>
          {protection.updatedAt ? (
            <p className={styles.small}>
              {t('protection.updatedAt', { when: formatWhen(protection.updatedAt, props.locale) })}
            </p>
          ) : null}
          {props.admin ? (
            <ActionForm
              action={saveProtectionAction.bind(
                null,
                props.locale,
                props.path,
                props.projectId,
                protection.hasPassword,
              )}
              className={styles.form}
            >
              <FormRadioGroup
                name="mode"
                legend={t('protection.mode')}
                className={styles.fieldset}
                defaultValue={protection.mode}
                options={PROTECTION_MODES.map((mode) => ({
                  value: mode,
                  label: t(`protection.modes.${mode}`),
                  hint: t(`protection.modeHints.${mode}`),
                }))}
              />
              <FormInput
                type="password"
                name="password"
                label={t('protection.password')}
                hint={
                  protection.hasPassword
                    ? t('protection.passwordKeep')
                    : t('protection.passwordNew')
                }
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
              />
              <FormSelect
                name="days"
                label={t('protection.days')}
                hint={t('protection.daysHint')}
                defaultValue={String(protection.days)}
                options={PROTECTION_DAYS.map((days) => ({
                  value: String(days),
                  label: t('protection.daysValue', { count: days }),
                }))}
              />
              <div className={styles.actions}>
                <SubmitButton pendingLabel={t('protection.saving')}>
                  {t('protection.save')}
                </SubmitButton>
              </div>
            </ActionForm>
          ) : (
            <p className={styles.small}>{t('protection.adminsOnly')}</p>
          )}
        </>
      )}
    </section>
  );
}
