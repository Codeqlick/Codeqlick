import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import styles from './Field.module.css';

/**
 * Form controls with label, hint and error wired through aria-describedby.
 * Hook-free on purpose so they render in Server and Client Components alike: the control id is
 * `id` when given, otherwise derived from `name` (`field-en-title` for `en.title`).
 */

type FieldBaseProps = {
  label: ReactNode;
  /** Error message shown under the control; also sets aria-invalid. */
  error?: string;
  hint?: ReactNode;
  /** Shows "(optional)" next to the label, using this translated word. */
  optionalLabel?: string;
  className?: string;
};

export function controlId(id: string | undefined, name: string | undefined): string {
  if (id) return id;
  return `field-${(name ?? 'control').replace(/[^a-zA-Z0-9_-]+/g, '-')}`;
}

function describedBy(baseId: string, hint: ReactNode, error: string | undefined) {
  const ids = [hint ? `${baseId}-hint` : '', error ? `${baseId}-error` : ''].filter(Boolean);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

function FieldShell({
  id,
  label,
  error,
  hint,
  optionalLabel,
  className,
  children,
}: FieldBaseProps & { id: string; children: ReactNode }) {
  return (
    <div className={[styles.field, className ?? ''].filter(Boolean).join(' ')}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {optionalLabel ? <span className={styles.optional}>({optionalLabel})</span> : null}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export type InputProps = FieldBaseProps &
  Omit<ComponentPropsWithoutRef<'input'>, 'className'> & { mono?: boolean };

export function Input({
  label,
  error,
  hint,
  optionalLabel,
  className,
  id,
  mono,
  ...rest
}: InputProps) {
  const fieldId = controlId(id, rest.name);
  return (
    <FieldShell
      id={fieldId}
      label={label}
      error={error}
      hint={hint}
      optionalLabel={optionalLabel}
      className={className}
    >
      <input
        {...rest}
        id={fieldId}
        aria-describedby={describedBy(fieldId, hint, error)}
        aria-invalid={error ? true : undefined}
        className={[styles.control, mono ? styles.mono : ''].filter(Boolean).join(' ')}
      />
    </FieldShell>
  );
}

export type TextareaProps = FieldBaseProps &
  Omit<ComponentPropsWithoutRef<'textarea'>, 'className'> & { mono?: boolean };

export function Textarea({
  label,
  error,
  hint,
  optionalLabel,
  className,
  id,
  mono,
  ...rest
}: TextareaProps) {
  const fieldId = controlId(id, rest.name);
  return (
    <FieldShell
      id={fieldId}
      label={label}
      error={error}
      hint={hint}
      optionalLabel={optionalLabel}
      className={className}
    >
      <textarea
        {...rest}
        id={fieldId}
        aria-describedby={describedBy(fieldId, hint, error)}
        aria-invalid={error ? true : undefined}
        className={[styles.control, styles.textarea, mono ? styles.mono : '']
          .filter(Boolean)
          .join(' ')}
      />
    </FieldShell>
  );
}

export type SelectOption = { value: string; label: string };

export type SelectProps = FieldBaseProps &
  Omit<ComponentPropsWithoutRef<'select'>, 'className' | 'children'> & {
    options: readonly SelectOption[];
    /** Adds a first option with an empty value and this label. */
    placeholder?: string;
  };

export function Select({
  label,
  error,
  hint,
  optionalLabel,
  className,
  id,
  options,
  placeholder,
  ...rest
}: SelectProps) {
  const fieldId = controlId(id, rest.name);
  return (
    <FieldShell
      id={fieldId}
      label={label}
      error={error}
      hint={hint}
      optionalLabel={optionalLabel}
      className={className}
    >
      <select
        {...rest}
        id={fieldId}
        aria-describedby={describedBy(fieldId, hint, error)}
        aria-invalid={error ? true : undefined}
        className={`${styles.control} ${styles.select}`}
      >
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export type CheckboxProps = Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'className'> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  className?: string;
};

export function Checkbox({ label, hint, error, className, id, ...rest }: CheckboxProps) {
  const fieldId = controlId(id, rest.name);
  return (
    <div className={[styles.field, className ?? ''].filter(Boolean).join(' ')}>
      <div className={styles.checkboxRow}>
        <input
          {...rest}
          type="checkbox"
          id={fieldId}
          className={styles.checkbox}
          aria-describedby={describedBy(fieldId, hint, error)}
          aria-invalid={error ? true : undefined}
        />
        <label htmlFor={fieldId} className={styles.label}>
          {label}
        </label>
      </div>
      {hint ? (
        <p id={`${fieldId}-hint`} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${fieldId}-error`} className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
