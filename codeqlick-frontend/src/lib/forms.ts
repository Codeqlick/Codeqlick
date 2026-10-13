/**
 * Shared form-state helpers for Server Actions + useActionState (usable on server and client).
 */
import type { z } from 'zod';
import type messages from '@/messages/en.json';

export type ValidationKey = keyof (typeof messages)['Validation'];

export type FieldErrors = Record<string, string>;

export type FormState = {
  status: 'idle' | 'success' | 'error';
  /** Form-level message (already translated). */
  message?: string;
  /** Field errors keyed by input name (already translated). */
  fieldErrors?: FieldErrors;
  /**
   * Submitted values, echoed back on errors. React 19 resets uncontrolled forms after an action;
   * fields use these as `defaultValue` so the user's input survives a failed submit.
   */
  values?: Record<string, string>;
};

export const initialFormState: FormState = { status: 'idle' };

const VALIDATION_KEYS: ReadonlySet<string> = new Set<ValidationKey>([
  'required',
  'email',
  'tooShort',
  'tooLong',
  'url',
  'slug',
  'number',
  'progress',
  'password',
  'messageTooShort',
  'translationIncomplete',
  'date',
  'choice',
]);

export function isValidationKey(value: string): value is ValidationKey {
  return VALIDATION_KEYS.has(value);
}

/** Field name for an issue path: ['translations', 'es', 'title'] → 'es.title'. */
function issueKey(path: readonly PropertyKey[]): string {
  return path.map((segment) => String(segment)).join('.') || '_form';
}

/**
 * Converts Zod issues into `{ field: message }`. Our schemas use Validation message keys as issue
 * messages; `translate` turns them into copy. Unknown messages are passed through.
 */
export function zodFieldErrors(
  error: z.ZodError,
  translate: (key: ValidationKey) => string,
): FieldErrors {
  const result: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issueKey(issue.path);
    if (key in result) continue;
    result[key] = isValidationKey(issue.message) ? translate(issue.message) : issue.message;
  }
  return result;
}

/** Trimmed string value of a FormData field ('' when missing or a File). */
export function formString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/** Raw (untrimmed) string, for Markdown bodies where leading whitespace matters. */
export function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.replace(/\r\n/g, '\n') : '';
}

export function formBoolean(formData: FormData, name: string): boolean {
  const value = formData.get(name);
  return value === 'on' || value === 'true' || value === '1';
}

/** All string entries of a FormData (files and honeypot excluded), for FormState.values. */
export function formValues(
  formData: FormData,
  exclude: readonly string[] = [],
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== 'string' || key.startsWith('$ACTION') || exclude.includes(key)) continue;
    values[key] = value;
  }
  return values;
}

/** Plain object of string fields from FormData, for Zod parsing. */
export function formObject(formData: FormData, names: readonly string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of names) result[name] = formText(formData, name);
  return result;
}
