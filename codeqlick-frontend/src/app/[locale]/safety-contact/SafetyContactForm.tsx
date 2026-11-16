'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { buttonClassName } from '@/components/ui/buttonStyles';
import { respondSafetyContactAction, type SafetyContactState } from './actions';
import styles from './SafetyContact.module.css';

export type SafetyContactCopy = {
  inviteLead: string;
  stopLead: string;
  accept: string;
  refuse: string;
  stop: string;
  working: string;
  accepted: string;
  refused: string;
  stopped: string;
  invalidLink: string;
  retry: string;
};

/**
 * The buttons of the contact page: accept or refuse an invitation, or stop the alerts. The result
 * replaces the buttons in an alert (a status or alert role), so it is announced.
 */
export function SafetyContactForm({
  token,
  kind,
  copy,
}: {
  token: string;
  kind: 'invite' | 'stop';
  copy: SafetyContactCopy;
}) {
  const [state, formAction, pending] = useActionState<SafetyContactState, FormData>(
    respondSafetyContactAction,
    {},
  );

  return (
    <div className={styles.body}>
      {state.done ? <Alert tone="success">{copy[state.done]}</Alert> : null}
      {state.problem === 'invalidLink' ? <Alert tone="error">{copy.invalidLink}</Alert> : null}
      {state.problem === 'retry' ? <Alert tone="error">{copy.retry}</Alert> : null}
      {state.done || state.problem === 'invalidLink' ? null : (
        <form action={formAction} className={styles.body}>
          <p>{kind === 'invite' ? copy.inviteLead : copy.stopLead}</p>
          <input type="hidden" name="token" value={token} />
          <div className={styles.actions}>
            {kind === 'invite' ? (
              <>
                <button
                  type="submit"
                  name="intent"
                  value="accept"
                  className={buttonClassName({})}
                  disabled={pending}
                >
                  {pending ? copy.working : copy.accept}
                </button>
                <button
                  type="submit"
                  name="intent"
                  value="refuse"
                  className={buttonClassName({ variant: 'outline' })}
                  disabled={pending}
                >
                  {copy.refuse}
                </button>
              </>
            ) : (
              <button
                type="submit"
                name="intent"
                value="stop"
                className={buttonClassName({})}
                disabled={pending}
              >
                {pending ? copy.working : copy.stop}
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
