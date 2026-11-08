import { getTranslations } from 'next-intl/server';
import { ActionForm, FormInput, FormSelect, FormTextarea } from '@/components/app/ActionForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resolveLocale } from '@/i18n/locale';
import { TAKEDOWN_REASONS } from '@/lib/api/swipe';
import vc from '../../videochat/videochat.module.css';
import { takedownAction } from '../actions';

type PageProps = { params: Promise<{ locale: string }> };

/** Removal requests from anyone, with or without an account (EU Digital Services Act). */
export default async function SwipeTakedownPage({ params }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Swipe.takedown' });
  const tr = await getTranslations({ locale, namespace: 'Swipe.report.reasons' });
  return (
    <section className={vc.panel}>
      <h1 className={vc.pageTitle}>{t('title')}</h1>
      <p className={vc.muted}>{t('lead')}</p>
      <ActionForm action={takedownAction} className={vc.form}>
        <input type="hidden" name="locale" value={locale} />
        {/* Honeypot: hidden from people, filled in by bots. */}
        <div hidden aria-hidden="true">
          <label>
            Website <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        <FormInput name="email" type="email" label={t('email')} hint={t('emailHint')} required />
        <FormInput name="photoRef" label={t('photoRef')} hint={t('photoRefHint')} maxLength={40} />
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
