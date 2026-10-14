import { getTranslations } from 'next-intl/server';
import { ActionForm, FormInput } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { TwoFactorSetup } from '@/components/app/TwoFactorSetup';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AppLocale } from '@/i18n/routing';
import { getTwoFactorStatus } from '@/lib/api/auth';
import {
  changePasswordAction,
  disableTwoFactorAction,
  enableTwoFactorAction,
  startTwoFactorAction,
} from '@/lib/auth/actions';
import { requireUser } from '@/lib/auth/session';

/** "Your account" page, shared by the client portal and the admin panel. */
export async function AccountPage({ locale }: { locale: AppLocale }) {
  const user = await requireUser(locale);
  const t = await getTranslations({ locale, namespace: 'Account' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const tf = await getTranslations({ locale, namespace: 'TwoFactor' });
  const twoFactor = await getTwoFactorStatus();

  return (
    <div className={styles.stack}>
      <PageHeader title={t('title')} lead={t('signedInAs', { email: user.email })} />

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>{t('changePassword')}</h2>
        <ActionForm action={changePasswordAction.bind(null, locale)} className={styles.form}>
          <p className={styles.muted}>{t('changePasswordBody')}</p>
          <FormInput
            name="currentPassword"
            type="password"
            label={t('currentPassword')}
            autoComplete="current-password"
            required
          />
          <FormInput
            name="newPassword"
            type="password"
            label={t('newPassword')}
            hint={t('newPasswordHint')}
            autoComplete="new-password"
            required
          />
          <FormInput
            name="confirmPassword"
            type="password"
            label={t('confirmPassword')}
            autoComplete="new-password"
            required
          />
          <div className={styles.actions}>
            <SubmitButton pendingLabel={tc('saving')}>{t('submit')}</SubmitButton>
          </div>
        </ActionForm>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>{tf('title')}</h2>
        {twoFactor.enabled ? (
          <>
            <p>{tf('onBody')}</p>
            <p className={styles.muted}>
              {tf('recoveryLeft', { count: twoFactor.recoveryCodesLeft })}
            </p>
            <ActionForm action={disableTwoFactorAction.bind(null, locale)} className={styles.form}>
              <h3>{tf('disableTitle')}</h3>
              <p className={styles.muted}>{tf('disableBody')}</p>
              <FormInput
                name="password"
                type="password"
                label={tf('password')}
                autoComplete="current-password"
                required
              />
              <FormInput
                name="code"
                label={tf('disableCode')}
                autoComplete="one-time-code"
                mono
                required
              />
              <div className={styles.actions}>
                <SubmitButton variant="outline" pendingLabel={tf('disabling')}>
                  {tf('disable')}
                </SubmitButton>
              </div>
            </ActionForm>
          </>
        ) : (
          <>
            <p className={styles.muted}>{tf('offBody')}</p>
            <TwoFactorSetup
              start={startTwoFactorAction.bind(null, locale)}
              enable={enableTwoFactorAction.bind(null, locale)}
              labels={{
                start: tf('start'),
                starting: tf('starting'),
                scan: tf('scan'),
                manual: tf('manual'),
                confirm: tf('confirm'),
                code: tf('code'),
                enable: tf('enable'),
                enabling: tf('enabling'),
                recoveryTitle: tf('recoveryTitle'),
                recoveryBody: tf('recoveryBody'),
                done: tf('done'),
              }}
            />
          </>
        )}
      </section>
    </div>
  );
}
