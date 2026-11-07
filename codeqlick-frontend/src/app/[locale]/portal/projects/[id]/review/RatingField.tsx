'use client';

import { useState } from 'react';
import { useFormState } from '@/components/app/ActionForm';
import fieldStyles from '@/components/ui/Field.module.css';
import styles from './RatingField.module.css';

/** 1–5 stars as radio buttons (keyboard and screen readers get the plain choice). */
export function RatingField({
  legend,
  starLabel,
  defaultValue,
}: {
  legend: string;
  /** Contains `{count}`. */
  starLabel: string;
  defaultValue?: number;
}) {
  const state = useFormState();
  const submitted = Number(state.values?.rating);
  const [value, setValue] = useState(submitted || defaultValue || 0);
  const error = state.fieldErrors?.rating;

  return (
    <fieldset className={styles.fieldset}>
      <legend className={fieldStyles.label}>{legend}</legend>
      <div className={styles.stars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className={`${styles.star} ${n <= value ? styles.on : ''}`}>
            <input
              type="radio"
              name="rating"
              value={n}
              checked={value === n}
              onChange={() => setValue(n)}
              className={styles.input}
            />
            <span aria-hidden="true">★</span>
            <span className="visually-hidden">{starLabel.replace('{count}', String(n))}</span>
          </label>
        ))}
      </div>
      {error ? <p className={fieldStyles.error}>{error}</p> : null}
    </fieldset>
  );
}
