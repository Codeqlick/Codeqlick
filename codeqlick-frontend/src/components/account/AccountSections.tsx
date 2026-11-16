import { getTranslations } from 'next-intl/server';
import { ActionForm, FormCheckbox, FormInput } from '@/components/app/ActionForm';
import { AvatarUpload } from '@/components/app/AvatarUpload';
import { TwoFactorSetup } from '@/components/app/TwoFactorSetup';
import { UsernameField } from '@/components/app/UsernameField';
import styles from '@/components/app/app.module.css';
import { Avatar } from '@/components/ui/Avatar';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { buttonClassName } from '@/components/ui/buttonStyles';
import type { AppLocale } from '@/i18n/routing';
import { getTwoFactorStatus } from '@/lib/api/auth';
import type { AuthUser } from '@/lib/api/types';
import {
  changePasswordAction,
  disableTwoFactorAction,
  enableTwoFactorAction,
  startTwoFactorAction,
} from '@/lib/auth/actions';
import {
  changeEmailAction,
  checkUsernameAction,
  deleteAccountAction,
  removeAvatarAction,
  updateNameAction,
  updateUsernameAction,
  uploadAvatarAction,
} from '@/lib/auth/account-actions';

/**
 * The account site's sections (architecture 6.5, decision 108), one component per panel so each
 * page shows its own: what used to be the portal's and the admin's "My account".
 */

type SectionProps = { locale: AppLocale; user: AuthUser };

/** Photo, name and username. */
export async function ProfileSection({ locale, user }: SectionProps) {
  const t = await getTranslations({ locale, namespace: 'Account' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  return (
    <section className={styles.panel}>
      <h2 className={styles.panelTitle}>{t('profile')}</h2>
      <div className={styles.form}>
        <h3>{t('avatar.title')}</h3>
        <p className={styles.muted}>{t('avatar.lead')}</p>
        <div className={styles.actions}>
          <Avatar file={user.avatar} name={user.name} size="lg" />
          <AvatarUpload action={uploadAvatarAction.bind(null, locale)} hasPhoto={!!user.avatar} />
          {user.avatar ? (
            <ActionForm action={removeAvatarAction.bind(null, locale)}>
              <SubmitButton variant="ghost" size="sm" pendingLabel={t('avatar.removing')}>
                {t('avatar.remove')}
              </SubmitButton>
            </ActionForm>
          ) : null}
        </div>
      </div>
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
    </section>
  );
}

/** A new sign-in email, confirmed from a link sent to it. */
export async function EmailSection({ locale, user }: SectionProps) {
  const t = await getTranslations({ locale, namespace: 'Account' });
  return (
    <section className={styles.panel}>
      <h2 className={styles.panelTitle}>{t('changeEmail')}</h2>
      <ActionForm action={changeEmailAction.bind(null, locale)} className={styles.form}>
        <p className={styles.muted}>{t('changeEmailBody', { email: user.email })}</p>
        <FormInput name="email" type="email" label={t('newEmail')} autoComplete="email" required />
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
  );
}

export async function PasswordSection({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: 'Account' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  return (
    <section className={styles.panel}>
      <h2 className={styles.panelTitle}>{t('changePassword')}</h2>
      <ActionForm
        action={changePasswordAction.bind(null, locale)}
        className={`${styles.form} ${styles.formNarrow}`}
      >
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
  );
}

/** Two-step verification with an authenticator app: set up, or turn off (not when required). */
export async function TwoFactorSection({ locale }: { locale: AppLocale }) {
  const tf = await getTranslations({ locale, namespace: 'TwoFactor' });
  const twoFactor = await getTwoFactorStatus();
  return (
    <section className={styles.panel} id="two-factor">
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
              className={`${styles.form} ${styles.formNarrow}`}
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
          {twoFactor.required ? <p>{tf('requiredNotice')}</p> : null}
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
  );
}

/** "Download my data" (GDPR): the export route next to the page. */
export async function ExportSection({ locale, href }: { locale: AppLocale; href: string }) {
  const t = await getTranslations({ locale, namespace: 'Account' });
  return (
    <section className={styles.panel}>
      <h2 className={styles.panelTitle}>{t('yourData')}</h2>
      <p className={styles.muted}>{t('yourDataBody')}</p>
      <div className={styles.actions}>
        <a className={buttonClassName({ variant: 'outline' })} href={href} download>
          {t('download')}
        </a>
      </div>
    </section>
  );
}

export async function DeleteSection({ locale, user }: SectionProps) {
  const t = await getTranslations({ locale, namespace: 'Account' });
  return (
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
  );
}
