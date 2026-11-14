'use client';

import type { ReactNode } from 'react';

type ConfirmFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  /** Asked with the browser's confirm dialog before the action runs. */
  message: string;
  children: ReactNode;
};

/** A form whose action only runs once the person confirms the message. */
export function ConfirmForm({ action, message, children }: ConfirmFormProps) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </form>
  );
}
