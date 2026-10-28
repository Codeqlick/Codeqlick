import { getTranslations } from 'next-intl/server';
import { ActionForm, FormInput, FormSelect } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { SiteRequestFields } from '@/components/app/SiteRequestFields';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resolveLocale } from '@/i18n/locale';
import { createPreviewAction } from '../actions';

/** "Nueva vista previa": the preview of a business that hasn't asked yet (architecture 8.2). */
export default async function NewPreviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Admin.previews' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const tl = await getTranslations({ locale, namespace: 'LocaleSwitcher' });

  return (
    <div className={styles.stack}>
      <PageHeader
        title={t('newTitle')}
        lead={t('newLead')}
        back={{ href: '/admin/previews', label: t('title') }}
      />
      <ActionForm action={createPreviewAction.bind(null, locale)} className={styles.stack}>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('businessTitle')}</h2>
          <SiteRequestFields locale={locale} />
        </section>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t('personTitle')}</h2>
          <p className={styles.muted}>{t('personBody')}</p>
          <div className={styles.form}>
            <div className={styles.row}>
              <FormInput
                id="name"
                name="name"
                label={t('personName')}
                optionalLabel={tc('optional')}
                maxLength={120}
              />
              <FormInput
                id="email"
                name="email"
                type="email"
                label={t('personEmail')}
                optionalLabel={tc('optional')}
                maxLength={254}
              />
              <FormSelect
                name="locale"
                label={t('personLocale')}
                options={(['es', 'en'] as const).map((value) => ({ value, label: tl(value) }))}
                defaultValue="es"
              />
            </div>
          </div>
        </section>
        <div className={styles.actions}>
          <SubmitButton pendingLabel={t('creating')}>{t('create')}</SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
