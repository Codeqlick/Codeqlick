'use client';

import { useState } from 'react';
import fieldStyles from '@/components/ui/Field.module.css';
import { formatMoney } from '@/lib/format';
import { useFormState } from './ActionForm';
import styles from './ProposalItemsField.module.css';

type Row = { key: number; description: string; quantity: string; price: string };

export type ProposalItemsLabels = {
  legend: string;
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  add: string;
  /** Contains `{n}`. */
  remove: string;
  /** Contains `{n}`: "Line {n}". */
  line: string;
  total: string;
  hint: string;
};

let nextKey = 0;
const row = (description = '', quantity = '1', price = ''): Row => ({
  key: nextKey++,
  description,
  quantity,
  price,
});

/** Rows echoed by a failed submit (one value per row, joined with newlines). */
function fromValues(values: Record<string, string>): Row[] {
  const descriptions = (values.itemDescription ?? '').split('\n');
  const quantities = (values.itemQuantity ?? '').split('\n');
  const prices = (values.itemPrice ?? '').split('\n');
  return descriptions.map((description, index) =>
    row(description, quantities[index] ?? '', prices[index] ?? ''),
  );
}

/** Cents of a typed price ("1250", "1250,5", "1250.50"), or 0 while it isn't a number. */
function cents(price: string): number {
  const value = Number(price.trim().replace(',', '.'));
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

/**
 * The lines of a proposal, inside an ActionForm: description, quantity and unit price (in euros)
 * per row, rows added and removed in place, and the running total. Posts one `itemDescription`,
 * `itemQuantity` and `itemPrice` per row.
 */
export function ProposalItemsField({
  initial,
  currency,
  locale,
  labels,
}: {
  initial: { description: string; quantity: number; unitPrice: number }[];
  currency: string;
  locale: string;
  labels: ProposalItemsLabels;
}) {
  const state = useFormState();
  const [rows, setRows] = useState<Row[]>(() =>
    initial.length > 0
      ? initial.map((item) =>
          row(item.description, String(item.quantity), (item.unitPrice / 100).toFixed(2)),
        )
      : [row()],
  );
  // After a failed submit, show what was sent (React has reset the inputs by then).
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.values?.itemDescription !== undefined) setRows(fromValues(state.values));
  }

  const update = (key: number, change: Partial<Row>) =>
    setRows((current) => current.map((item) => (item.key === key ? { ...item, ...change } : item)));
  const total = rows.reduce(
    (sum, item) => sum + (Number.parseInt(item.quantity, 10) || 0) * cents(item.price),
    0,
  );
  const error = (index: number, field: string) => state.fieldErrors?.[`items.${index}.${field}`];
  const listError = state.fieldErrors?.items;

  return (
    <fieldset className={styles.fieldset}>
      <legend className={fieldStyles.label}>{labels.legend}</legend>
      <p className={fieldStyles.hint}>{labels.hint}</p>
      <div className={styles.head} aria-hidden="true">
        <span>{labels.description}</span>
        <span>{labels.quantity}</span>
        <span>{labels.unitPrice}</span>
        <span className={styles.right}>{labels.amount}</span>
        <span />
      </div>
      <ol className={styles.rows}>
        {rows.map((item, index) => {
          const n = index + 1;
          const line = labels.line.replace('{n}', String(n));
          const errors = [
            error(index, 'description'),
            error(index, 'quantity'),
            error(index, 'unitPrice'),
          ]
            .filter(Boolean)
            .join(' ');
          const amount = (Number.parseInt(item.quantity, 10) || 0) * cents(item.price);
          return (
            <li key={item.key} className={styles.row}>
              <input
                name="itemDescription"
                aria-label={`${labels.description} (${line})`}
                className={fieldStyles.control}
                defaultValue={item.description}
                maxLength={500}
                required
                aria-invalid={error(index, 'description') ? true : undefined}
                onChange={(event) => update(item.key, { description: event.target.value })}
              />
              <input
                name="itemQuantity"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                aria-label={`${labels.quantity} (${line})`}
                className={fieldStyles.control}
                defaultValue={item.quantity}
                required
                aria-invalid={error(index, 'quantity') ? true : undefined}
                onChange={(event) => update(item.key, { quantity: event.target.value })}
              />
              <input
                name="itemPrice"
                inputMode="decimal"
                aria-label={`${labels.unitPrice} (${line})`}
                className={fieldStyles.control}
                defaultValue={item.price}
                placeholder="0,00"
                required
                aria-invalid={error(index, 'unitPrice') ? true : undefined}
                onChange={(event) => update(item.key, { price: event.target.value })}
              />
              <output className={styles.amount} aria-label={`${labels.amount} (${line})`}>
                {formatMoney(amount, currency, locale)}
              </output>
              <button
                type="button"
                className={styles.remove}
                aria-label={labels.remove.replace('{n}', String(n))}
                disabled={rows.length === 1}
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
              {errors ? (
                <p className={`${fieldStyles.error} ${styles.rowError}`} role="alert">
                  {errors}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
      {listError ? (
        <p className={fieldStyles.error} role="alert">
          {listError}
        </p>
      ) : null}
      <div className={styles.foot}>
        <button
          type="button"
          className={styles.add}
          onClick={() => setRows((current) => [...current, row()])}
        >
          + {labels.add}
        </button>
        <p className={styles.total}>
          <span>{labels.total}</span>
          <strong>{formatMoney(total, currency, locale)}</strong>
        </p>
      </div>
    </fieldset>
  );
}
