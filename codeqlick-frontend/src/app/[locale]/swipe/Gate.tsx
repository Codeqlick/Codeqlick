import { getTranslations } from 'next-intl/server';
import { ActionForm, FormCheckbox, FormInput } from '@/components/app/ActionForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import type { SwipeStatus } from '@/lib/api/swipe';
import { formatDateTime } from '@/lib/format';
import vc from '../videochat/videochat.module.css';
import { onboardAction } from './actions';

/**
 * What a signed-in person sees before Swipe's own pages: the suspension, or the 18+ and rules
 * step. Null when they may go on.
 */
export async function SwipeGate({ locale, status }: { locale: AppLocale; status: SwipeStatus }) {
  const t = await getTranslations({ locale, namespace: 'Swipe' });
  if (status.suspended) {
    const until = status.suspension?.until;
    return (
      <section className={vc.panel}>
        <h1 className={vc.pageTitle}>{t('suspended.title')}</h1>
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
  if (status.onboarded) return null;
  return (
    <section className={vc.panel}>
      <h1 className={vc.pageTitle}>{t('onboarding.title')}</h1>
      <p className={vc.muted}>{t('onboarding.lead')}</p>
      <div className={vc.warning} role="note">
        <strong>{t('landing.warningTitle')}.</strong> {t('landing.warning')}
      </div>
      <ActionForm action={onboardAction} className={vc.form}>
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
        <p>
          <Link href="/swipe/rules" target="_blank" className={vc.inlineLink}>
            {t('onboarding.readRules')}
          </Link>
        </p>
        <SubmitButton block pendingLabel={t('onboarding.submitting')}>
          {t('onboarding.submit')}
        </SubmitButton>
      </ActionForm>
    </section>
  );
}
