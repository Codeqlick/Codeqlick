'use client';

import { useState, useTransition } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { useRouter } from '@/i18n/navigation';
import type { EnableTwoFactorResult, TwoFactorSetupResult } from '@/lib/auth/actions';
import styles from './TwoFactorSetup.module.css';

export type TwoFactorSetupLabels = {
  start: string;
  starting: string;
  scan: string;
  manual: string;
  confirm: string;
  code: string;
  enable: string;
  enabling: string;
  recoveryTitle: string;
  recoveryBody: string;
  done: string;
};

type Step =
  | { name: 'idle' }
  | { name: 'scan'; secret: string; qrCode: string }
  | { name: 'codes'; recoveryCodes: string[] };

/** Setting up an authenticator app: start, scan, confirm with a first code, save recovery codes. */
export function TwoFactorSetup({
  start,
  enable,
  labels,
}: {
  start: () => Promise<TwoFactorSetupResult>;
  enable: (code: string) => Promise<EnableTwoFactorResult>;
  labels: TwoFactorSetupLabels;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ name: 'idle' });
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function onStart() {
    setError(undefined);
    startTransition(async () => {
      const result = await start();
      if ('error' in result) setError(result.error);
      else setStep({ name: 'scan', ...result });
    });
  }

  function onEnable(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    startTransition(async () => {
      const result = await enable(code);
      if ('error' in result) setError(result.error);
      else setStep({ name: 'codes', recoveryCodes: result.recoveryCodes });
    });
  }

  if (step.name === 'codes') {
    return (
      <div className={styles.stack}>
        <Alert tone="success">{labels.recoveryTitle}</Alert>
        <p>{labels.recoveryBody}</p>
        <ol className={styles.codes}>
          {step.recoveryCodes.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
        <div>
          <Button onClick={() => router.refresh()}>{labels.done}</Button>
        </div>
      </div>
    );
  }

  if (step.name === 'scan') {
    return (
      <form className={styles.stack} onSubmit={onEnable} noValidate>
        <p>{labels.scan}</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- generated SVG data URL */}
        <img src={step.qrCode} alt="" width={180} height={180} className={styles.qr} />
        <p className={styles.muted}>
          {labels.manual} <code className={styles.secret}>{step.secret}</code>
        </p>
        <p>{labels.confirm}</p>
        <Input
          name="code"
          label={labels.code}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          mono
          error={error}
          required
        />
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? labels.enabling : labels.enable}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className={styles.stack}>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div>
        <Button variant="outline" onClick={onStart} disabled={pending}>
          {pending ? labels.starting : labels.start}
        </Button>
      </div>
    </div>
  );
}
