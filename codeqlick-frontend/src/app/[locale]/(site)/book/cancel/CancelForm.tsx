'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { initialFormState } from '@/lib/forms';
import { cancelCallAction } from '../actions';

/** A button, not a GET: link previews and mail scanners must not cancel the call. */
export function CancelForm({ token }: { token: string }) {
  const t = useTranslations('Book');
  const locale = useLocale();
  const [state, formAction] = useActionState(cancelCallAction, initialFormState);
  if (state.status === 'success') return <Alert tone="success">{t('cancelled')}</Alert>;
  return (
    <form action={formAction}>
      {state.message ? <Alert tone="error">{state.message}</Alert> : null}
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="token" value={token} />
      <SubmitButton variant="outline" pendingLabel={t('cancelling')}>
        {t('cancelButton')}
      </SubmitButton>
    </form>
  );
}
