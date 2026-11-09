'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { FormInput } from '@/components/app/ActionForm';
import type { UsernameCheck } from '@/lib/api/auth';

type UsernameFieldProps = {
  current: string | null;
  check: (username: string) => Promise<UsernameCheck | null>;
};

const normalize = (value: string) => value.trim().toLowerCase().replace(/^@/, '');

/** The username input, telling as you type whether the name is free (architecture 6). */
export function UsernameField({ current, check }: UsernameFieldProps) {
  const t = useTranslations('Account.username');
  const [typed, setTyped] = useState(current ?? '');
  const [result, setResult] = useState<UsernameCheck | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef('');

  useEffect(() => () => clearTimeout(timer.current), []);

  function changed(value: string) {
    const name = normalize(value);
    setTyped(name);
    setResult(null);
    latest.current = name;
    clearTimeout(timer.current);
    if (!name || name === current) return;
    timer.current = setTimeout(() => {
      void check(name).then((answer) => {
        if (latest.current === name) setResult(answer);
      });
    }, 400);
  }

  let hint = t('hint');
  if (typed && typed === current) hint = t('yours', { username: current });
  else if (typed && !result) hint = t('checking');
  else if (result?.available) hint = t('available', { username: result.username });
  else if (result?.reason) hint = t(result.reason);

  return (
    <FormInput
      name="username"
      label={t('label')}
      hint={hint}
      defaultValue={current ?? ''}
      onChange={(event) => changed(event.target.value)}
      autoComplete="username"
      autoCapitalize="none"
      spellCheck={false}
      maxLength={21}
      aria-live="polite"
    />
  );
}
