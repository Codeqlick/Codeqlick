'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { unsubscribeAction } from '@/components/newsletter/actions';
import { Alert } from '@/components/ui/Alert';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { initialFormState } from '@/lib/forms';

/** A button, not a GET: link scanners and previews must not unsubscribe anyone. */
export function UnsubscribeForm({ token }: { token: string }) {
  const t = useTranslations('Newsletter');
  const locale = useLocale();
  const [state, formAction] = useActionState(unsubscribeAction, initialFormState);
  if (state.status === 'success') return <Alert tone="success">{t('unsubscribed')}</Alert>;
  return (
    <form action={formAction}>
      {state.message ? <Alert tone="error">{state.message}</Alert> : null}
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="token" value={token} />
      <SubmitButton variant="outline" pendingLabel={t('unsubscribing')}>
        {t('unsubscribe')}
      </SubmitButton>
    </form>
  );
}
