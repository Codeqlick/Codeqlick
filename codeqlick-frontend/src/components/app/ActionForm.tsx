'use client';

import { createContext, useActionState, useContext, type ReactNode } from 'react';
import { Alert } from '@/components/ui/Alert';
import {
  Checkbox,
  Input,
  Select,
  Textarea,
  type CheckboxProps,
  type InputProps,
  type SelectProps,
  type TextareaProps,
} from '@/components/ui/Field';
import { initialFormState, type FormState } from '@/lib/forms';

export type FormAction = (state: FormState, formData: FormData) => Promise<FormState>;

const FormStateContext = createContext<FormState>(initialFormState);

/**
 * <form> wired to a Server Action with useActionState. It shows the action's message and shares
 * its state with the Form* fields below, so Server Components can declare whole forms.
 */
export function ActionForm({
  action,
  className,
  children,
}: {
  action: FormAction;
  className?: string;
  children: ReactNode;
}) {
  const [state, formAction] = useActionState(action, initialFormState);

  return (
    <form action={formAction} className={className} noValidate>
      {state.message ? (
        <Alert tone={state.status === 'success' ? 'success' : 'error'}>{state.message}</Alert>
      ) : null}
      <FormStateContext value={state}>{children}</FormStateContext>
    </form>
  );
}

/** Field error and echoed value (after a failed submit) for the control called `name`. */
function useField(name: string | undefined) {
  const state = useContext(FormStateContext);
  const key = name ?? '';
  return { error: state.fieldErrors?.[key], submitted: state.values?.[key], values: state.values };
}

export function FormInput(props: Omit<InputProps, 'error'>) {
  const { error, submitted } = useField(props.name);
  return <Input {...props} error={error} defaultValue={submitted ?? props.defaultValue} />;
}

export function FormTextarea(props: Omit<TextareaProps, 'error'>) {
  const { error, submitted } = useField(props.name);
  return <Textarea {...props} error={error} defaultValue={submitted ?? props.defaultValue} />;
}

export function FormSelect(props: Omit<SelectProps, 'error'>) {
  const { error, submitted } = useField(props.name);
  return <Select {...props} error={error} defaultValue={submitted ?? props.defaultValue} />;
}

export function FormCheckbox(props: Omit<CheckboxProps, 'error'>) {
  const { error, submitted, values } = useField(props.name);
  // Unchecked boxes are absent from FormData, so "values exist" decides which default applies.
  const defaultChecked = values ? submitted !== undefined : props.defaultChecked;
  return <Checkbox {...props} error={error} defaultChecked={defaultChecked} />;
}
