import { getTranslations } from 'next-intl/server';
import {
  ActionForm,
  FormCheckbox,
  FormInput,
  FormRadioGroup,
  FormSelect,
} from '@/components/app/ActionForm';
import { BypassReveal } from '@/components/cloud/BypassReveal';
import { Badge } from '@/components/ui/Badge';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AppLocale } from '@/i18n/routing';
import { getCloudProtection, type CloudProtectionBypass } from '@/lib/api/cloud';
import { formatWhen, PROTECTION_DAYS, PROTECTION_MODES } from '@/lib/cloud';
import { generateBypassAction, revokeBypassAction, saveProtectionAction } from '../../../actions';
import appUi from '@/components/layout/AppPage.module.css';
import styles from '../../../cloud.module.css';

type Props = {
  locale: AppLocale;
  projectId: string;
  path: string;
  admin: boolean;
  /** The project is suspended: the bypass token can't be changed. */
  suspended?: boolean;
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
    <section className={`${appUi.card} ${styles.narrow}`} aria-labelledby="protection-title">
      <h2 id="protection-title" className={appUi.cardTitle}>
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
              <div className={appUi.actions}>
                <SubmitButton pendingLabel={t('protection.saving')}>
                  {t('protection.save')}
                </SubmitButton>
              </div>
            </ActionForm>
          ) : (
            <p className={styles.small}>{t('protection.adminsOnly')}</p>
          )}
          <BypassRow
            {...props}
            t={t}
            bypass={protection.bypass}
            canChange={props.admin && !props.suspended}
          />
        </>
      )}
    </section>
  );
}

type BypassRowProps = Props & {
  t: Awaited<ReturnType<typeof getTranslations<'Cloud'>>>;
  bypass: CloudProtectionBypass | null;
  canChange: boolean;
};

/**
 * The "Bypass for automation" row (architecture 4.13): the token's state for everyone; admins
 * generate (shown once), replace and revoke it.
 */
function BypassRow({
  t,
  bypass,
  canChange,
  locale,
  path,
  projectId,
  admin,
  suspended,
}: BypassRowProps) {
  return (
    <section className={styles.bypass} aria-labelledby="bypass-title">
      <h3 id="bypass-title" className={styles.rowTitle}>
        {t('protection.bypass.title')}
      </h3>
      <p className={styles.muted}>{t('protection.bypass.lead')}</p>
      {bypass ? (
        <>
          <p className={styles.rowTitle}>
            <span className={styles.mono}>{bypass.prefix}…</span>
          </p>
          <p className={styles.small}>
            {bypass.createdBy
              ? t('protection.bypass.createdBy', {
                  name: bypass.createdBy.name,
                  when: formatWhen(bypass.createdAt, locale),
                })
              : t('protection.bypass.created', { when: formatWhen(bypass.createdAt, locale) })}
            {' · '}
            {bypass.lastUsedAt
              ? t('protection.bypass.lastUsed', { when: formatWhen(bypass.lastUsedAt, locale) })
              : t('protection.bypass.neverUsed')}
          </p>
        </>
      ) : (
        <p className={styles.small}>{t('protection.bypass.none')}</p>
      )}
      {suspended && admin ? (
        <p className={styles.small}>{t('protection.bypass.suspended')}</p>
      ) : null}
      {canChange ? (
        <>
          <ActionForm
            action={generateBypassAction.bind(null, locale, path, projectId, bypass !== null)}
            className={styles.form}
          >
            <BypassReveal />
            {bypass ? (
              <FormCheckbox
                id="bypass-confirm-replace"
                name="confirm"
                label={t('protection.bypass.confirmReplace')}
                hint={t('protection.bypass.replaceWarning')}
                required
              />
            ) : null}
            <div className={appUi.actions}>
              <SubmitButton variant="outline" pendingLabel={t('protection.bypass.generating')}>
                {bypass ? t('protection.bypass.regenerate') : t('protection.bypass.generate')}
              </SubmitButton>
            </div>
          </ActionForm>
          {bypass ? (
            <ActionForm
              action={revokeBypassAction.bind(null, locale, path, projectId)}
              className={styles.form}
            >
              <FormCheckbox
                id="bypass-confirm-revoke"
                name="confirm"
                label={t('protection.bypass.confirmRevoke')}
                hint={t('protection.bypass.revokeWarning')}
                required
              />
              <div className={appUi.actions}>
                <SubmitButton
                  variant="danger"
                  size="sm"
                  pendingLabel={t('protection.bypass.revoking')}
                >
                  {t('protection.bypass.revoke')}
                </SubmitButton>
              </div>
            </ActionForm>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
