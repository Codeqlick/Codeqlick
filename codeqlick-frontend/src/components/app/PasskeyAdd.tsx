'use client';

import {
  browserSupportsWebAuthn,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/browser';
import { useState, useSyncExternalStore, useTransition } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { useRouter } from '@/i18n/navigation';
import type { PasskeyOptionsResult, PasskeyRegisterResult } from '@/lib/auth/passkey-actions';
import { PASSKEY_NAME_MAX, passkeyErrorKind, type PasskeyErrorKind } from '@/lib/passkeys';
import styles from './Passkeys.module.css';

export type PasskeyAddLabels = Record<PasskeyErrorKind, string> & {
  title: string;
  body: string;
  name: string;
  nameHint: string;
  password: string;
  add: string;
  adding: string;
};

const subscribeNever = () => () => {};

/**
 * Adding a passkey in My account → Security: the password (checked by the API), a name, then the
 * browser's own steps (`navigator.credentials.create`). Both API calls go through Server Actions.
 */
export function PasskeyAdd({
  getOptions,
  register,
  suggestedName,
  labels,
}: {
  getOptions: (password: string) => Promise<PasskeyOptionsResult>;
  register: (response: RegistrationResponseJSON, name: string) => Promise<PasskeyRegisterResult>;
  suggestedName: string;
  labels: PasskeyAddLabels;
}) {
  const supported = useSyncExternalStore(subscribeNever, browserSupportsWebAuthn, () => true);
  const router = useRouter();
  const [name, setName] = useState(suggestedName);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<{ message: string; field?: 'password' | 'name' }>();
  const [done, setDone] = useState<string>();
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setDone(undefined);
    startTransition(async () => {
      const options = await getOptions(password);
      if ('error' in options) {
        setError({ message: options.error, field: options.field });
        return;
      }
      let response: RegistrationResponseJSON;
      try {
        response = await startRegistration({
          optionsJSON: options.options as unknown as PublicKeyCredentialCreationOptionsJSON,
        });
      } catch (caught) {
        setError({ message: labels[passkeyErrorKind(caught)] });
        return;
      }
      const result = await register(response, name);
      if ('error' in result) {
        setError({ message: result.error });
        return;
      }
      setPassword('');
      setDone(result.message);
      router.refresh();
    });
  }

  if (!supported) return <p className={styles.muted}>{labels.unsupported}</p>;
  return (
    <form className={styles.add} onSubmit={onSubmit} noValidate>
      <h3>{labels.title}</h3>
      <p className={styles.muted}>{labels.body}</p>
      {done ? <Alert tone="success">{done}</Alert> : null}
      {error && !error.field ? <Alert tone="error">{error.message}</Alert> : null}
      <Input
        id="passkey-new-name"
        name="passkeyName"
        label={labels.name}
        hint={labels.nameHint}
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={PASSKEY_NAME_MAX}
        autoComplete="off"
        error={error?.field === 'name' ? error.message : undefined}
      />
      <Input
        id="passkey-new-password"
        name="passkeyPassword"
        type="password"
        label={labels.password}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="current-password"
        error={error?.field === 'password' ? error.message : undefined}
        required
      />
      <div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? labels.adding : labels.add}
        </Button>
      </div>
    </form>
  );
}
