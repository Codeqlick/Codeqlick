'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { confirmAction } from '@/components/newsletter/actions';
import { NewsletterSignup } from '@/components/newsletter/NewsletterSignup';
import { Alert } from '@/components/ui/Alert';
import { buttonClassName } from '@/components/ui/buttonStyles';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { initialFormState } from '@/lib/forms';

/** A button, not a GET: link scanners must not confirm sign-ups that someone else made. */
export function ConfirmForm({ token }: { token: string }) {
  const t = useTranslations('Newsletter');
  const locale = useLocale();
  const [state, formAction] = useActionState(confirmAction, initialFormState);

  if (state.status === 'success') {
    return (
      <>
        <Alert tone="success">{t('confirmedLead')}</Alert>
        <p>
          <Link href="/blog" className={buttonClassName({ variant: 'primary' })}>
            {t('goToBlog')}
          </Link>
        </p>
      </>
    );
  }
  if (state.values?.expired) {
    return (
      <>
        <Alert tone="error">{t('confirmExpired')}</Alert>
        <NewsletterSignup />
      </>
    );
  }
  return (
    <form action={formAction}>
      {state.message ? <Alert tone="error">{state.message}</Alert> : null}
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="token" value={token} />
      <SubmitButton pendingLabel={t('confirming')}>{t('confirm')}</SubmitButton>
    </form>
  );
}
