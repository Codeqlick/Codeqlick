'use client';

import { useFormState } from '@/components/app/ActionForm';
import { UsernameField } from '@/components/app/UsernameField';
import type { UsernameCheck } from '@/lib/api/auth';

/**
 * Shown once the confirmation is refused because someone took the chosen username after the
 * sign-up: the field to choose another, sent with the same link.
 */
export function UsernameRetry({
  check,
}: {
  check: (username: string) => Promise<UsernameCheck | null>;
}) {
  const state = useFormState();
  if (!state.fieldErrors?.username && !state.values?.username) return null;
  return <UsernameField current={null} check={check} required />;
}
