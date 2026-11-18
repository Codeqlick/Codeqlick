import { getTranslations } from 'next-intl/server';
import { ActionForm, FormCheckbox } from '@/components/app/ActionForm';
import { PageHeader } from '@/components/app/PageHeader';
import styles from '@/components/app/app.module.css';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resolveLocale } from '@/i18n/locale';
import { getPreferences } from '@/lib/api/auth';
import { updatePreferencesAction } from '@/lib/auth/actions';
import { requireUser } from '@/lib/auth/session';

/** Every optional email of the account, in one place. */
export default async function AccountNotificationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = resolveLocale((await params).locale);
  const user = await requireUser(locale);
  const t = await getTranslations({ locale, namespace: 'AccountSite' });
  const ta = await getTranslations({ locale, namespace: 'Account' });
  const tc = await getTranslations({ locale, namespace: 'Common' });

  const preferences = user.role === 'CLIENT' ? await getPreferences() : null;
  const save = <SubmitButton pendingLabel={tc('saving')}>{tc('save')}</SubmitButton>;
  const nothing = !preferences;

  return (
    <div className={styles.stack}>
      <PageHeader title={t('nav.notifications')} lead={t('notifications.lead')} />
      {nothing ? <p className={styles.muted}>{t('notifications.none')}</p> : null}

      {preferences ? (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('clients.site')}</h2>
          <ActionForm
            action={updatePreferencesAction.bind(null, locale)}
            className={`${styles.form} ${styles.formNarrow}`}
          >
            <FormCheckbox
              name="weeklyDigest"
              label={ta('weeklyDigest')}
              hint={ta('weeklyDigestHint')}
              defaultChecked={preferences.weeklyDigest}
            />
            <FormCheckbox
              name="monthlyReport"
              label={ta('monthlyReport')}
              hint={ta('monthlyReportHint')}
              defaultChecked={preferences.monthlyReport}
            />
            <div className={styles.actions}>{save}</div>
          </ActionForm>
        </section>
      ) : null}
    </div>
  );
}
