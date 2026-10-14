import { getTranslations } from 'next-intl/server';
import { ActionForm, FormInput } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AppLocale } from '@/i18n/routing';
import { changePasswordAction } from '@/lib/auth/actions';
import { requireUser } from '@/lib/auth/session';

/** "Your account" page, shared by the client portal and the admin panel. */
export async function AccountPage({ locale }: { locale: AppLocale }) {
  const user = await requireUser(locale);
  const t = await getTranslations({ locale, namespace: 'Account' });
  const tc = await getTranslations({ locale, namespace: 'Common' });

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
    </div>
  );
}
