'use client';

import { useState } from 'react';
import { FormInput } from '@/components/app/ActionForm';

type LocalDateTimeFieldProps = {
  id: string;
  /** The ISO instant is sent as `name`; the visible field as `${name}Local`. */
  name: string;
  label: string;
  hint?: string;
};

/**
 * A date and time in the person's own time zone. The browser turns it into an instant (ISO, UTC)
 * in a hidden field, so the server never has to guess the zone.
 */
export function LocalDateTimeField({ id, name, label, hint }: LocalDateTimeFieldProps) {
  const [instant, setInstant] = useState('');
  return (
    <>
      <FormInput
        id={id}
        name={`${name}Local`}
        type="datetime-local"
        label={label}
        hint={hint}
        required
        onChange={(event) => {
          const date = new Date(event.target.value);
          setInstant(Number.isNaN(date.getTime()) ? '' : date.toISOString());
        }}
      />
      <input type="hidden" name={name} value={instant} />
    </>
  );
}
