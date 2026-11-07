'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { buttonClassName, type ButtonSize, type ButtonVariant } from './buttonStyles';

type SubmitButtonProps = {
  children: ReactNode;
  /** Label while the parent form's action is pending. */
  pendingLabel?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
  /** A keyboard shortcut finds the button by this (`data-shortcut`). */
  shortcut?: string;
  /** Analytics: a click counts as this event (Umami's `data-umami-event`). */
  trackEvent?: string;
};

/** Submit button that disables itself and shows `pendingLabel` while its <form> is submitting. */
export function SubmitButton({
  children,
  pendingLabel,
  variant = 'primary',
  size = 'md',
  block = false,
  className,
  name,
  value,
  disabled,
  shortcut,
  trackEvent,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      data-shortcut={shortcut}
      data-umami-event={trackEvent}
      className={buttonClassName({ variant, size, block, className })}
      disabled={disabled || pending}
      aria-disabled={disabled || pending}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
