/** The news section's helpers (architecture 8.2): limits, the Madrid day and the form's checks. */

/** The list's page size: the page that renders it and the action that loads more use it. */
export const NEWS_PAGE_SIZE = 20;

export const NEWS_LIMITS = { title: 120, summary: 300, body: 10_000 } as const;

/** What the client types for a post; `expiresAt` is a `YYYY-MM-DD` day or empty. */
export type NewsForm = {
  title: string;
  summary: string;
  body: string;
  /** `media/<file>` or empty. */
  photo: string;
  expiresAt: string;
};

export const EMPTY_NEWS_FORM: NewsForm = {
  title: '',
  summary: '',
  body: '',
  photo: '',
  expiresAt: '',
};

export type NewsProblem = 'required' | 'tooLong' | 'past' | 'date';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The day it is in Madrid at `now` (`YYYY-MM-DD`): offers expire by the Madrid calendar. */
export function madridDay(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/**
 * The day an API `expiresAt` (the end of a Madrid day) stands for, for the date field. The end of
 * a Madrid day is 21:59 or 22:59 UTC of the same date, so the UTC date is the Madrid day.
 */
export function expiryDay(expiresAt: string | null): string {
  return expiresAt ? expiresAt.slice(0, 10) : '';
}

/** Checks the form before it is sent; the API still has the last word. */
export function newsProblems(
  form: NewsForm,
  today: string,
): Partial<Record<keyof NewsForm, NewsProblem>> {
  const problems: Partial<Record<keyof NewsForm, NewsProblem>> = {};
  const title = form.title.trim();
  const summary = form.summary.trim();
  const body = form.body.trim();
  if (!title) problems.title = 'required';
  else if (title.length > NEWS_LIMITS.title) problems.title = 'tooLong';
  if (!summary) problems.summary = 'required';
  else if (summary.length > NEWS_LIMITS.summary) problems.summary = 'tooLong';
  if (!body) problems.body = 'required';
  else if (body.length > NEWS_LIMITS.body) problems.body = 'tooLong';
  if (form.expiresAt) {
    if (!DAY.test(form.expiresAt)) problems.expiresAt = 'date';
    else if (form.expiresAt < today) problems.expiresAt = 'past';
  }
  return problems;
}

/** The body of a save: trimmed texts, and `null` to take the photo or the expiry off. */
export function newsPayload(form: NewsForm) {
  return {
    title: form.title.trim(),
    summary: form.summary.trim(),
    body: form.body.trim(),
    photo: form.photo || null,
    expiresAt: form.expiresAt || null,
  };
}

/** Whether the form differs from the post it started as (to warn before leaving it). */
export function newsChanged(a: NewsForm, b: NewsForm): boolean {
  return (
    a.title !== b.title ||
    a.summary !== b.summary ||
    a.body !== b.body ||
    a.photo !== b.photo ||
    a.expiresAt !== b.expiresAt
  );
}

/** Maps an API field path or message to the form's field (the API names the field in either). */
export function newsFieldOf(path: string, message = ''): keyof NewsForm | null {
  const text = `${path} ${message}`.toLowerCase();
  for (const field of ['title', 'summary', 'body', 'photo'] as const) {
    if (text.includes(field)) return field;
  }
  if (text.includes('expires')) return 'expiresAt';
  return null;
}
