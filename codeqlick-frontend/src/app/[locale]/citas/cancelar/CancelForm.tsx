'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { initialFormState } from '@/lib/forms';
import { cancelWithTokenAction } from '../actions';

/** One button: cancels the appointment of the emailed link. */
export function CancelForm({
  token,
  locale,
  labels,
}: {
  token: string;
  locale: string;
  labels: { button: string; cancelling: string };
}) {
  const [state, formAction] = useActionState(cancelWithTokenAction, initialFormState);
  if (state.status === 'success') return <Alert tone="success">{state.message}</Alert>;
  return (
    <form action={formAction}>
      {state.message ? <Alert tone="error">{state.message}</Alert> : null}
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="locale" value={locale} />
      <SubmitButton pendingLabel={labels.cancelling}>{labels.button}</SubmitButton>
    </form>
  );
}
