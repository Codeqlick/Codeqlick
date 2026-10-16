import { getTranslations } from 'next-intl/server';
import { ActionForm, FormInput, FormSelect } from '@/components/app/ActionForm';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resolveLocale } from '@/i18n/locale';
import { isNotFound } from '@/lib/api/errors';
import { adminGetLead } from '@/lib/api/leads';
import { SITE_PRESETS } from '@/lib/api/types';
import { firstParam } from '@/lib/format';
import { onboardSiteAction } from '../actions';

/** "nombre-del-negocio" from "Nombre del Negocio". */
function slugOf(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export default async function NewSitePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ lead?: string | string[] }>;
}) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Admin.sites' });
  const tm = await getTranslations({ locale, namespace: 'ManagedSite' });
  const tk = (key: string) => tm(key as never);
  const leadId = firstParam((await searchParams).lead);
  const lead = leadId
    ? await adminGetLead(leadId).catch((error: unknown) => {
        if (isNotFound(error)) return null;
        throw error;
      })
    : null;
  const business = lead?.company ?? '';

  return (
    <div className={styles.stack}>
      <PageHeader
        title={t('newTitle')}
        lead={t('newLead')}
        back={{ href: '/admin/sites', label: t('title') }}
      />
      <section className={styles.panel}>
        <ActionForm action={onboardSiteAction.bind(null, locale)} className={styles.form}>
          {lead ? <p className={styles.muted}>{t('fromLead', { name: lead.name })}</p> : null}
          <input type="hidden" name="leadId" value={lead?.id ?? ''} />
          <h2 className={styles.panelTitle}>{t('contactTitle')}</h2>
          <div className={styles.row}>
            <FormInput id="name" name="name" label={t('name')} defaultValue={lead?.name} required />
            <FormInput
              id="email"
              name="email"
              type="email"
              label={t('email')}
              defaultValue={lead?.email}
              required
            />
            <FormSelect
              name="locale"
              label={t('locale')}
              options={(['es', 'en'] as const).map((value) => ({
                value,
                label: t(`locales.${value}`),
              }))}
              defaultValue={lead?.locale ?? 'es'}
              required
            />
          </div>
          <h2 className={styles.panelTitle}>{t('businessTitle')}</h2>
          <div className={styles.row}>
            <FormInput
              id="businessName"
              name="businessName"
              label={t('businessName')}
              hint={t('businessHint')}
              defaultValue={business}
              required
            />
            <FormInput
              id="slug"
              name="slug"
              label={tm('slug')}
              hint={tm('slugHint')}
              defaultValue={business ? slugOf(business) : ''}
              required
              maxLength={40}
            />
          </div>
          <div className={styles.row}>
            <FormSelect
              name="preset"
              label={tm('preset')}
              options={SITE_PRESETS.map((value) => ({ value, label: tk(`presets.${value}`) }))}
              defaultValue="peluqueria"
              required
            />
            <FormInput id="domain" name="domain" label={tm('domain')} hint={tm('domainHint')} />
          </div>
          <div className={styles.actions}>
            <SubmitButton pendingLabel={t('submitting')}>{t('submit')}</SubmitButton>
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
