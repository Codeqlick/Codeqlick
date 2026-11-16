'use client';

import type { MouseEvent, ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { buttonClassName, type ButtonSize, type ButtonVariant } from '@/components/ui/buttonStyles';

/**
 * A click handler that cancels the submit unless the person confirms `message`; no message: it
 * submits straight away.
 */
export function confirmBeforeSubmit(
  message: string | undefined,
  ask: (message: string) => boolean,
): (event: Pick<MouseEvent, 'preventDefault'>) => void {
  return (event) => {
    if (message && !ask(message)) event.preventDefault();
  };
}

/**
 * A submit button for an ActionForm that asks first (the browser's confirm dialog) when `confirm`
 * is set, so the form keeps showing the action's message (unlike ConfirmForm's void actions).
 */
export function ConfirmSubmitButton({
  children,
  confirm,
  pendingLabel,
  variant = 'outline',
  size = 'sm',
  pressed,
}: {
  children: ReactNode;
  confirm?: string;
  pendingLabel?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** A switch's state (`aria-pressed`). */
  pressed?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={buttonClassName({ variant, size, block: false })}
      disabled={pending}
      aria-disabled={pending}
      aria-pressed={pressed}
      onClick={confirmBeforeSubmit(confirm, (message) => window.confirm(message))}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
