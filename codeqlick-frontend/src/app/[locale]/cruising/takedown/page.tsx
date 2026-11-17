import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ActionForm, FormInput, FormSelect, FormTextarea } from '@/components/app/ActionForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resolveCruisingLocale } from '@/i18n/locale';
import { TAKEDOWN_REASONS } from '@/lib/cruising';
import { webappAlternates, webappPath } from '@/lib/webapp-seo';
import adult from '@/components/adult/adult.module.css';
import { takedownAction } from '../actions';

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveCruisingLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Cruising.takedown' });
  const title = t('title');
  const description = t('lead');
  return {
    title,
    description,
    alternates: webappAlternates('cruising', locale, '/takedown'),
    openGraph: { title, description, url: webappPath('cruising', locale, '/takedown') },
  };
}

/** Removal requests from anyone, with or without an account (EU Digital Services Act). */
export default async function CruisingTakedownPage({ params }: PageProps) {
  const locale = resolveCruisingLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Cruising.takedown' });
  const tr = await getTranslations({ locale, namespace: 'Cruising.report.reasons' });
  return (
    <section className={adult.panel}>
      <h1 className={adult.pageTitle}>{t('title')}</h1>
      <p className={adult.muted}>{t('lead')}</p>
      <ActionForm action={takedownAction} className={adult.form}>
        <input type="hidden" name="locale" value={locale} />
        {/* Honeypot: hidden from people, filled in by bots. */}
        <div hidden aria-hidden="true">
          <label>
            Website <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        <FormInput name="email" type="email" label={t('email')} hint={t('emailHint')} required />
        <FormInput
          name="spotLink"
          label={t('spotLink')}
          hint={t('spotLinkHint')}
          maxLength={300}
          optionalLabel={t('optional')}
        />
        <FormInput
          name="mediaRef"
          label={t('mediaRef')}
          hint={t('mediaRefHint')}
          maxLength={8}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          optionalLabel={t('optional')}
        />
        <FormSelect
          name="reason"
          label={t('reason')}
          placeholder={t('reasonPlaceholder')}
          options={TAKEDOWN_REASONS.map((value) => ({ value, label: tr(value) }))}
          required
        />
        <FormTextarea
          name="details"
          label={t('details')}
          hint={t('detailsHint')}
          rows={5}
          minLength={10}
          maxLength={2000}
          required
        />
        <SubmitButton block pendingLabel={t('sending')}>
          {t('submit')}
        </SubmitButton>
      </ActionForm>
    </section>
  );
}
