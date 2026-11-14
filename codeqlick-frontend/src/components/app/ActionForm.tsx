'use client';

import { useTranslations } from 'next-intl';
import { createContext, useActionState, useContext, useState, type ReactNode } from 'react';
import { Alert } from '@/components/ui/Alert';
import {
  Checkbox,
  controlId,
  Input,
  Select,
  Textarea,
  type CheckboxProps,
  type InputProps,
  type SelectProps,
  type TextareaProps,
} from '@/components/ui/Field';
import fieldStyles from '@/components/ui/Field.module.css';
import { initialFormState, type FormState } from '@/lib/forms';

export type FormAction = (state: FormState, formData: FormData) => Promise<FormState>;

const FormStateContext = createContext<FormState>(initialFormState);
/** How many times the surrounding form has been submitted (0 before the first). */
const SubmissionContext = createContext(0);

type CountedState = FormState & { submission: number };

/**
 * <form> wired to a Server Action with useActionState. It shows the action's message and shares
 * its state with the Form* fields below, so Server Components can declare whole forms.
 */
export function ActionForm({
  action,
  id,
  className,
  children,
}: {
  action: FormAction;
  /** For fields outside the form that join it with `form={id}`. */
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  const [state, formAction] = useActionState(
    async (previous: CountedState, formData: FormData): Promise<CountedState> => ({
      ...(await action(previous, formData)),
      submission: previous.submission + 1,
    }),
    { ...initialFormState, submission: 0 },
  );

  return (
    <form id={id} action={formAction} className={className} noValidate>
      {state.message ? (
        <Alert tone={state.status === 'success' ? 'success' : 'error'}>{state.message}</Alert>
      ) : null}
      <FormStateContext value={state}>
        <SubmissionContext value={state.submission}>{children}</SubmissionContext>
      </FormStateContext>
    </form>
  );
}

/** The surrounding ActionForm's last result, for custom fields (errors and echoed values). */
export function useFormState(): FormState {
  return useContext(FormStateContext);
}

/** Field error and echoed value (after a failed submit) for the control called `name`. */
function useField(name: string | undefined) {
  const state = useContext(FormStateContext);
  const key = name ?? '';
  return { error: state.fieldErrors?.[key], submitted: state.values?.[key], values: state.values };
}

export function FormInput(props: Omit<InputProps, 'error'>) {
  const { error, submitted } = useField(props.name);
  const defaultValue = submitted ?? props.defaultValue;
  if (props.type === 'password') {
    return <PasswordInput {...props} error={error} defaultValue={defaultValue} />;
  }
  return <Input {...props} error={error} defaultValue={defaultValue} />;
}

/** A password field with a toggle button (aria-pressed) that shows what was typed. */
function PasswordInput(props: Omit<InputProps, 'type' | 'addon'> & { type?: string }) {
  const t = useTranslations('Common');
  const [shown, setShown] = useState(false);
  return (
    <Input
      {...props}
      type={shown ? 'text' : 'password'}
      addon={
        <button
          type="button"
          className={fieldStyles.addon}
          aria-label={t('showPassword')}
          aria-pressed={shown}
          aria-controls={props.id ?? controlId(undefined, props.name)}
          onClick={() => setShown(!shown)}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
            {shown ? <path d="M4 4l16 16" /> : null}
          </svg>
        </button>
      }
    />
  );
}

export function FormTextarea(props: Omit<TextareaProps, 'error'>) {
  const { error, submitted } = useField(props.name);
  return <Textarea {...props} error={error} defaultValue={submitted ?? props.defaultValue} />;
}

export function FormSelect(props: Omit<SelectProps, 'error'>) {
  const { error, submitted } = useField(props.name);
  const submission = useContext(SubmissionContext);
  // React doesn't re-apply a select's defaultValue: after every submit (failed or saved) the form
  // reset would put back the first option. Keyed by the submit count, it remounts showing what was
  // sent on a failure, or the saved value (the page's fresh defaultValue) on success.
  return (
    <Select
      key={submission}
      {...props}
      error={error}
      defaultValue={submitted ?? props.defaultValue}
    />
  );
}

/**
 * Checkboxes sharing one `name` (FormData gets one entry per ticked box). After a failed submit
 * the ticked ones come back from the action's echoed values.
 */
export function FormCheckboxGroup({
  name,
  legend,
  options,
  defaultValues = [],
  className,
  idPrefix,
}: {
  name: string;
  legend: string;
  /** Keeps ids unique when several forms on a page share `name`. */
  idPrefix?: string;
  options: { value: string; label: string }[];
  defaultValues?: string[];
  className?: string;
}) {
  const { error, submitted, values } = useField(name);
  const ticked = new Set(values ? (submitted?.split('\n') ?? []) : defaultValues);
  return (
    <fieldset className={className}>
      <legend>{legend}</legend>
      {options.map((option) => (
        <Checkbox
          key={option.value}
          id={`${idPrefix ?? name}-${option.value}`}
          name={name}
          value={option.value}
          label={option.label}
          defaultChecked={ticked.has(option.value)}
        />
      ))}
      {error ? (
        <p role="alert" className={fieldStyles.error}>
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/**
 * Radio buttons sharing one `name`. After a failed submit the chosen one comes back from the
 * action's echoed values; keyed by the submit count, like FormSelect, so the form reset can't put
 * back a stale choice.
 */
export function FormRadioGroup({
  name,
  legend,
  options,
  defaultValue,
  className,
  idPrefix,
}: {
  name: string;
  legend: string;
  /** Keeps ids unique when several forms on a page share `name`. */
  idPrefix?: string;
  options: { value: string; label: string; hint?: string }[];
  defaultValue?: string;
  className?: string;
}) {
  const { error, submitted } = useField(name);
  const submission = useContext(SubmissionContext);
  const chosen = submitted ?? defaultValue;
  const prefix = idPrefix ?? name;
  return (
    <fieldset
      key={submission}
      className={className}
      aria-describedby={error ? `${prefix}-error` : undefined}
    >
      <legend>{legend}</legend>
      {options.map((option) => {
        const id = `${prefix}-${option.value}`;
        return (
          <div key={option.value} className={fieldStyles.field}>
            <div className={fieldStyles.checkboxRow}>
              <input
                type="radio"
                id={id}
                name={name}
                value={option.value}
                defaultChecked={chosen === option.value}
                className={fieldStyles.checkbox}
                aria-describedby={option.hint ? `${id}-hint` : undefined}
              />
              <label htmlFor={id} className={fieldStyles.label}>
                {option.label}
              </label>
            </div>
            {option.hint ? (
              <p id={`${id}-hint`} className={fieldStyles.hint}>
                {option.hint}
              </p>
            ) : null}
          </div>
        );
      })}
      {error ? (
        <p id={`${prefix}-error`} role="alert" className={fieldStyles.error}>
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/**
 * Radio buttons sharing one `name`, in a fieldset whose legend names the choice; each option may
 * carry a hint (linked with aria-describedby). After a failed submit the sent choice comes back.
 */
export function FormRadioGroup({
  name,
  legend,
  options,
  defaultValue,
  className,
  idPrefix,
}: {
  name: string;
  legend: string;
  options: { value: string; label: string; hint?: string }[];
  defaultValue?: string;
  className?: string;
  /** Keeps ids unique when several forms on a page share `name`. */
  idPrefix?: string;
}) {
  const { error, submitted } = useField(name);
  const submission = useContext(SubmissionContext);
  const chosen = submitted ?? defaultValue;
  const errorId = `${idPrefix ?? name}-error`;
  // Keyed by the submit count like FormSelect, so the form reset shows the sent or saved choice.
  return (
    <fieldset key={submission} className={className} aria-describedby={error ? errorId : undefined}>
      <legend>{legend}</legend>
      {options.map((option) => {
        const id = `${idPrefix ?? name}-${option.value}`;
        return (
          <div key={option.value} className={fieldStyles.field}>
            <div className={fieldStyles.checkboxRow}>
              <input
                type="radio"
                id={id}
                name={name}
                value={option.value}
                defaultChecked={chosen === option.value}
                className={fieldStyles.radio}
                aria-describedby={option.hint ? `${id}-hint` : undefined}
              />
              <label htmlFor={id} className={fieldStyles.label}>
                {option.label}
              </label>
            </div>
            {option.hint ? (
              <p id={`${id}-hint`} className={fieldStyles.hint}>
                {option.hint}
              </p>
            ) : null}
          </div>
        );
      })}
      {error ? (
        <p id={errorId} role="alert" className={fieldStyles.error}>
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

export function FormCheckbox(props: Omit<CheckboxProps, 'error'>) {
  const { error, submitted, values } = useField(props.name);
  // Unchecked boxes are absent from FormData, so "values exist" decides which default applies.
  const defaultChecked = values ? submitted !== undefined : props.defaultChecked;
  return <Checkbox {...props} error={error} defaultChecked={defaultChecked} />;
}
