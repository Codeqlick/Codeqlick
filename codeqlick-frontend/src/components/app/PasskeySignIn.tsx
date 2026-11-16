'use client';

import {
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  startAuthentication,
  WebAuthnAbortService,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import { useEffect, useState, useSyncExternalStore, useTransition } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import type { PasskeyLoginOptions } from '@/lib/api/types';
import { isAbort, passkeyErrorKind } from '@/lib/passkeys';
import styles from './PasskeySignIn.module.css';

export type PasskeySignInLabels = { or: string; button: string; pending: string; failed: string };

type SignIn = (
  challengeId: string,
  response: AuthenticationResponseJSON,
) => Promise<{ error: string }>;

const subscribeNever = () => () => {};

/**
 * "Sign in with a passkey" on the login page (decision 104): a button, and the passkeys the browser
 * suggests in the email field (conditional UI, where supported). Hidden without WebAuthn. Both
 * ceremonies end in `signIn`, a Server Action that sets the same cookies as a password sign-in.
 */
export function PasskeySignIn({
  getOptions,
  signIn,
  labels,
}: {
  getOptions: () => Promise<PasskeyLoginOptions | null>;
  signIn: SignIn;
  labels: PasskeySignInLabels;
}) {
  const supported = useSyncExternalStore(subscribeNever, browserSupportsWebAuthn, () => false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const failed = labels.failed;

  // Conditional UI: the browser offers the account's passkeys in the email field's suggestions.
  // The props come from the server and don't change while the page is open: this runs once.
  useEffect(() => {
    if (!supported) return;
    let active = true;
    void (async () => {
      if (!(await browserSupportsWebAuthnAutofill())) return;
      const challenge = await getOptions();
      if (!challenge || !active) return;
      let response: AuthenticationResponseJSON;
      try {
        response = await startAuthentication({
          optionsJSON: challenge.options as unknown as PublicKeyCredentialRequestOptionsJSON,
          useBrowserAutofill: true,
        });
      } catch (caught) {
        // Aborted by the button (or by leaving the page), or no suitable field: nothing to say.
        if (active && !isAbort(caught) && passkeyErrorKind(caught) === 'failed') {
          setError(failed);
        }
        return;
      }
      startTransition(async () => {
        // On success the action redirects and nothing comes back.
        const result = await signIn(challenge.challengeId, response);
        if (result?.error) setError(result.error);
      });
    })();
    return () => {
      active = false;
      WebAuthnAbortService.cancelCeremony();
    };
  }, [supported, getOptions, signIn, failed]);

  function onClick() {
    setError(undefined);
    startTransition(async () => {
      const challenge = await getOptions();
      if (!challenge) {
        setError(labels.failed);
        return;
      }
      let response: AuthenticationResponseJSON;
      try {
        response = await startAuthentication({
          optionsJSON: challenge.options as unknown as PublicKeyCredentialRequestOptionsJSON,
        });
      } catch (caught) {
        if (passkeyErrorKind(caught) !== 'cancelled') setError(labels.failed);
        return;
      }
      const result = await signIn(challenge.challengeId, response);
      if (result?.error) setError(result.error);
    });
  }

  if (!supported) return null;
  return (
    <div className={styles.stack}>
      <p className={styles.or}>{labels.or}</p>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Button variant="outline" block onClick={onClick} disabled={pending}>
        {pending ? labels.pending : labels.button}
      </Button>
    </div>
  );
}
