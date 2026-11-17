import { getTranslations } from 'next-intl/server';
import { ActionForm, FormCheckbox, FormInput } from '@/components/app/ActionForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import type { CruisingStatus } from '@/lib/api/cruising';
import { formatDateTime } from '@/lib/format';
import adult from '@/components/adult/adult.module.css';
import { onboardAction } from './actions';

/**
 * What a signed-in person sees before proposing or reviewing: the suspension, or the entry step
 * (date of birth, the rules and the consent to special category data). Null when they may go on.
 * `inline` is for a page that already has its own title (a spot's reviews).
 */
export async function CruisingGate({
  locale,
  status,
  inline = false,
}: {
  locale: AppLocale;
  status: CruisingStatus;
  inline?: boolean;
}) {
  const t = await getTranslations({ locale, namespace: 'Cruising' });
  const Heading = inline ? 'h2' : 'h1';
  const panel = inline ? adult.suspension : adult.panel;
  if (status.suspended) {
    const until = status.suspension?.until;
    return (
      <section className={panel}>
        <Heading className={inline ? adult.sectionTitle : adult.pageTitle}>
          {t('suspended.title')}
        </Heading>
        <p>{t('suspended.body')}</p>
        <dl>
          <dt>{t('suspended.reason')}</dt>
          <dd>{status.suspension?.reason ?? t('suspended.noReason')}</dd>
          <dt>{t('suspended.until')}</dt>
          <dd>{until ? formatDateTime(until, locale) : t('suspended.untilReviewed')}</dd>
        </dl>
      </section>
    );
  }
  if (status.allowed) return null;
  return (
    <section className={panel}>
      <Heading className={inline ? adult.sectionTitle : adult.pageTitle}>
        {t('onboarding.title')}
      </Heading>
      <p className={adult.muted}>
        {status.onboarded ? t('onboarding.leadAgain') : t('onboarding.lead')}
      </p>
      <div className={adult.warning} role="note">
        <strong>{t('landing.warningTitle')}.</strong> {t('landing.warning')}
      </div>
      <ActionForm action={onboardAction} className={adult.form}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="termsVersion" value={status.termsVersion} />
        <FormInput
          name="birthDate"
          type="date"
          label={t('onboarding.birthDate')}
          hint={t('onboarding.birthDateHint')}
          autoComplete="bday"
          required
        />
        <FormCheckbox name="acceptTerms" label={t('onboarding.accept')} required />
        <FormCheckbox
          name="consentSpecialData"
          label={t('onboarding.consent')}
          hint={t('onboarding.consentHint')}
          required
        />
        <p>
          <Link href="/cruising/rules" target="_blank" className={adult.inlineLink}>
            {t('onboarding.readRules')}
          </Link>
          {' · '}
          <Link href="/cruising/terms-of-use" target="_blank" className={adult.inlineLink}>
            {t('legal.terms')}
          </Link>
          {' · '}
          <Link href="/cruising/privacy-policy" target="_blank" className={adult.inlineLink}>
            {t('legal.privacy')}
          </Link>
        </p>
        <SubmitButton block pendingLabel={t('onboarding.submitting')}>
          {t('onboarding.submit')}
        </SubmitButton>
      </ActionForm>
    </section>
  );
}
