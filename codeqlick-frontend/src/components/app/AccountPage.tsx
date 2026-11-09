import { getTranslations } from 'next-intl/server';
import { ActionForm, FormCheckbox, FormInput } from '@/components/app/ActionForm';
import { ActiveSessions } from '@/components/app/ActiveSessions';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { TwoFactorSetup } from '@/components/app/TwoFactorSetup';
import { UsernameField } from '@/components/app/UsernameField';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { buttonClassName } from '@/components/ui/buttonStyles';
import type { AppLocale } from '@/i18n/routing';
import { getPreferences, getTwoFactorStatus } from '@/lib/api/auth';
import {
  changePasswordAction,
  updatePreferencesAction,
  disableTwoFactorAction,
  enableTwoFactorAction,
  startTwoFactorAction,
} from '@/lib/auth/actions';
import {
  changeEmailAction,
  checkUsernameAction,
  deleteAccountAction,
  updateNameAction,
  updateUsernameAction,
} from '@/lib/auth/account-actions';
import { requireUser } from '@/lib/auth/session';

/** "Your account" page, shared by the client portal and the admin panel. */
export async function AccountPage({ locale }: { locale: AppLocale }) {
  const user = await requireUser(locale);
  const t = await getTranslations({ locale, namespace: 'Account' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const tf = await getTranslations({ locale, namespace: 'TwoFactor' });
  const [twoFactor, preferences] = await Promise.all([getTwoFactorStatus(), getPreferences()]);

  return (
    <div className={styles.stack}>
      <PageHeader
        title={t('title')}
        lead={
          user.username
            ? `@${user.username} · ${t('signedInAs', { email: user.email })}`
            : t('signedInAs', { email: user.email })
        }
      />

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>{t('profile')}</h2>
        <ActionForm action={updateNameAction.bind(null, locale)} className={styles.form}>
          <FormInput
            name="name"
            label={t('name')}
            defaultValue={user.name}
            autoComplete="name"
            required
          />
          <div className={styles.actions}>
            <SubmitButton pendingLabel={tc('saving')}>{tc('save')}</SubmitButton>
          </div>
        </ActionForm>
        <ActionForm action={updateUsernameAction.bind(null, locale)} className={styles.form}>
          <UsernameField current={user.username ?? null} check={checkUsernameAction} />
          <div className={styles.actions}>
            <SubmitButton variant="outline" pendingLabel={tc('saving')}>
              {t('username.save')}
            </SubmitButton>
          </div>
        </ActionForm>
        <ActionForm action={changeEmailAction.bind(null, locale)} className={styles.form}>
          <h3>{t('changeEmail')}</h3>
          <p className={styles.muted}>{t('changeEmailBody', { email: user.email })}</p>
          <FormInput
            name="email"
            type="email"
            label={t('newEmail')}
            autoComplete="email"
            required
          />
          <FormInput
            name="password"
            type="password"
            label={t('password')}
            autoComplete="current-password"
            required
          />
          <div className={styles.actions}>
            <SubmitButton variant="outline" pendingLabel={t('sending')}>
              {t('changeEmailSubmit')}
            </SubmitButton>
          </div>
        </ActionForm>
      </section>

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
            {twoFactor.required ? (
              <p className={styles.muted}>{tf('requiredCantDisable')}</p>
            ) : (
              <ActionForm
                action={disableTwoFactorAction.bind(null, locale)}
                className={styles.form}
              >
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
            )}
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

      {user.role === 'CLIENT' ? (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('emails')}</h2>
          <ActionForm action={updatePreferencesAction.bind(null, locale)} className={styles.form}>
            <FormCheckbox
              name="weeklyDigest"
              label={t('weeklyDigest')}
              hint={t('weeklyDigestHint')}
              defaultChecked={preferences.weeklyDigest}
            />
            <FormCheckbox
              name="monthlyReport"
              label={t('monthlyReport')}
              hint={t('monthlyReportHint')}
              defaultChecked={preferences.monthlyReport}
            />
            <div className={styles.actions}>
              <SubmitButton pendingLabel={tc('saving')}>{tc('save')}</SubmitButton>
            </div>
          </ActionForm>
        </section>
      ) : null}

      <ActiveSessions locale={locale} />

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>{t('yourData')}</h2>
        <p className={styles.muted}>{t('yourDataBody')}</p>
        <div className={styles.actions}>
          <a
            className={buttonClassName({ variant: 'outline' })}
            href={`/${locale}/${user.role === 'ADMIN' ? 'admin' : 'portal'}/account/export`}
            download
          >
            {t('download')}
          </a>
        </div>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>{t('deleteTitle')}</h2>
        {user.role === 'ADMIN' ? (
          <p className={styles.muted}>{t('deleteAdmin')}</p>
        ) : (
          <ActionForm action={deleteAccountAction.bind(null, locale)} className={styles.form}>
            <p className={styles.muted}>{t('deleteBody')}</p>
            <FormInput
              name="password"
              type="password"
              label={t('password')}
              autoComplete="current-password"
              required
            />
            <FormCheckbox name="confirm" label={t('deleteConfirm')} />
            <div className={styles.actions}>
              <SubmitButton variant="danger" pendingLabel={t('deleting')}>
                {t('deleteSubmit')}
              </SubmitButton>
            </div>
          </ActionForm>
        )}
      </section>
    </div>
  );
}
