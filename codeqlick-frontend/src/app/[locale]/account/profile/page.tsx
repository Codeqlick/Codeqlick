import { getTranslations } from 'next-intl/server';
import { ProfileSection } from '@/components/account/AccountSections';
import { ActionForm, FormSelect } from '@/components/app/ActionForm';
import { PageHeader } from '@/components/app/PageHeader';
import styles from '@/components/app/app.module.css';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resolveLocale } from '@/i18n/locale';
import { getPreferences } from '@/lib/api/auth';
import { requireUser } from '@/lib/auth/session';
import { emailLanguageAction } from '../actions';

/** Photo, name, username and the language of the emails. */
export default async function AccountProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = resolveLocale((await params).locale);
  const user = await requireUser(locale);
  const t = await getTranslations({ locale, namespace: 'AccountSite' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const preferences = await getPreferences();

  return (
    <div className={styles.stack}>
      <PageHeader title={t('nav.profile')} lead={t('profile.lead')} />
      <ProfileSection locale={locale} user={user} />
      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>{t('profile.languageTitle')}</h2>
        <ActionForm
          action={emailLanguageAction.bind(null, locale)}
          className={`${styles.form} ${styles.formNarrow}`}
        >
          <p className={styles.muted}>{t('profile.languageBody')}</p>
          <FormSelect
            name="emailLocale"
            label={t('profile.languageLabel')}
            defaultValue={preferences.locale ?? 'en'}
            options={[
              { value: 'en', label: 'English' },
              { value: 'es', label: 'Español' },
            ]}
          />
          <div className={styles.actions}>
            <SubmitButton pendingLabel={tc('saving')}>{tc('save')}</SubmitButton>
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
