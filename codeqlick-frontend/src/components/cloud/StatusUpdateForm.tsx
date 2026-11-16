'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { initialFormState } from '@/lib/forms';
import { confirmStatusAction, unsubscribeStatusAction } from './status-subscribe-actions';

/**
 * The button of a status page subscriber's emailed link (decision 105): confirming the sign-up or
 * unsubscribing. A button, not a GET, so link scanners and previews change nothing.
 */
export function StatusUpdateForm({
  mode,
  token,
}: {
  mode: 'confirm' | 'unsubscribe';
  token: string;
}) {
  const t = useTranslations('Cloud.statusUpdates');
  const locale = useLocale();
  const [state, formAction] = useActionState(
    mode === 'confirm' ? confirmStatusAction : unsubscribeStatusAction,
    initialFormState,
  );

  if (state.status === 'success') {
    const team = state.values?.team;
    return (
      <>
        <Alert tone="success">
          {mode === 'confirm'
            ? t('confirmed', { team: state.values?.teamName ?? '' })
            : t('unsubscribed', { team: state.values?.teamName ?? '' })}
        </Alert>
        {team ? (
          <p>
            <Link href={`/cloud/status/${team}`}>{t('back')}</Link>
          </p>
        ) : null}
      </>
    );
  }
  return (
    <form action={formAction}>
      {state.message ? <Alert tone="error">{state.message}</Alert> : null}
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="token" value={token} />
      <SubmitButton
        variant={mode === 'confirm' ? 'primary' : 'outline'}
        pendingLabel={mode === 'confirm' ? t('confirming') : t('unsubscribing')}
      >
        {mode === 'confirm' ? t('confirm') : t('unsubscribe')}
      </SubmitButton>
    </form>
  );
}
