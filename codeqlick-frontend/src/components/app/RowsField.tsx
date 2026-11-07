'use client';

import { useState } from 'react';
import fieldStyles from '@/components/ui/Field.module.css';
import { useFormState } from './ActionForm';
import styles from './RowsField.module.css';

export type RowsColumn = {
  key: string;
  label: string;
  /** Grid track, e.g. `2fr` or `8rem`. */
  width?: string;
  multiline?: boolean;
  maxLength?: number;
  placeholder?: string;
};

type Row = { key: number; values: Record<string, string> };

let nextKey = 0;
const row = (values: Record<string, string> = {}): Row => ({ key: nextKey++, values });

/**
 * Repeating rows of text inputs inside an ActionForm (opening hours, services, reviews…): rows
 * added and removed in place. Posts one `<name>.<column>` per row and column, in order, so the
 * action zips them back (empty rows are dropped there).
 */
export function RowsField({
  name,
  columns,
  initial,
  labels,
  max = 24,
}: {
  name: string;
  columns: RowsColumn[];
  initial: Array<Record<string, string | undefined>>;
  labels: { legend: string; hint?: string; add: string; remove: string; line: string };
  max?: number;
}) {
  const state = useFormState();
  const [rows, setRows] = useState<Row[]>(() =>
    initial.length > 0
      ? initial.map((values) =>
          row(Object.fromEntries(columns.map((c) => [c.key, values[c.key] ?? '']))),
        )
      : [row()],
  );
  // After a failed submit, show what was sent (React has reset the inputs by then).
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    const sent = columns.map((c) => (state.values?.[`${name}.${c.key}`] ?? '').split('\n'));
    if (state.values?.[`${name}.${columns[0]!.key}`] !== undefined) {
      setRows(
        (sent[0] ?? []).map((_, index) =>
          row(Object.fromEntries(columns.map((c, ci) => [c.key, sent[ci]?.[index] ?? '']))),
        ),
      );
    }
  }
  const template = `${columns.map((c) => c.width ?? '1fr').join(' ')} 2.75rem`;

  return (
    <fieldset className={styles.fieldset}>
      <legend className={fieldStyles.label}>{labels.legend}</legend>
      {labels.hint ? <p className={fieldStyles.hint}>{labels.hint}</p> : null}
      <ol className={styles.rows}>
        {rows.map((item, index) => {
          const line = labels.line.replace('{n}', String(index + 1));
          return (
            <li key={item.key} className={styles.row} style={{ gridTemplateColumns: template }}>
              {columns.map((column) => {
                const props = {
                  name: `${name}.${column.key}`,
                  'aria-label': `${column.label} (${line})`,
                  className: fieldStyles.control,
                  defaultValue: item.values[column.key],
                  maxLength: column.maxLength,
                  placeholder: column.placeholder,
                };
                return (
                  <div key={column.key} className={styles.cell}>
                    {index === 0 ? (
                      <span className={styles.cellLabel} aria-hidden="true">
                        {column.label}
                      </span>
                    ) : null}
                    {column.multiline ? <textarea rows={3} {...props} /> : <input {...props} />}
                  </div>
                );
              })}
              <button
                type="button"
                className={styles.remove}
                aria-label={labels.remove.replace('{n}', String(index + 1))}
                onClick={() =>
                  setRows((current) => current.filter((other) => other.key !== item.key))
                }
              >
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path
                    d="M6 6l12 12M18 6 6 18"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </li>
          );
        })}
      </ol>
      {rows.length < max ? (
        <button
          type="button"
          className={styles.add}
          onClick={() => setRows((current) => [...current, row()])}
        >
          + {labels.add}
        </button>
      ) : null}
    </fieldset>
  );
}
