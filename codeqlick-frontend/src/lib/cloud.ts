/** Formatting for Codeqlick Cloud's console (architecture 4.13). Pure: server and client. */

const UNITS = ['B', 'KB', 'MB', 'GB'] as const;

/** 1536 → "1.5 KB" ("1,5 KB" in Spanish). */
export function formatBytes(bytes: number, locale: string): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  const number = new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    maximumFractionDigits: digits,
  }).format(value);
  return `${number} ${UNITS[unit]}`;
}

/** A date and time in Madrid, short: "12 nov 2026, 18:05". */
export function formatWhen(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    timeZone: 'Europe/Madrid',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

/** A project's or team's address part: lowercase letters, digits and single dashes. */
export function cloudSlug(text: string, max: number): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '');
}

// ── Scheduled rebuilds (architecture 4.13 "Builds from Git", decision 65) ───────────────────

export const REBUILD_FREQUENCIES = ['off', 'hourly', 'daily', 'weekly'] as const;
export type RebuildFrequency = (typeof REBUILD_FREQUENCIES)[number];

/** Scheduled builds failing in a row that switch the schedule off. */
export const REBUILD_MAX_FAILURES = 5;

export type RebuildBody = {
  frequency: RebuildFrequency;
  minute?: number;
  hour?: number;
  weekday?: number;
};

export type RebuildFieldError = 'required' | 'range';

/** A whole number from a form field within [min, max]; 'empty', or null if it is not one. */
function wholeNumber(text: string | undefined, min: number, max: number): number | 'empty' | null {
  const trimmed = (text ?? '').trim();
  if (trimmed === '') return 'empty';
  if (!/^\d{1,2}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= min && value <= max ? value : null;
}

/**
 * The schedule form as the API's body, with only the fields its frequency uses; or the problem
 * with each field (`frequency`, `minute`, `hour`, `weekday`).
 */
export function parseRebuildForm(form: {
  frequency?: string;
  minute?: string;
  hour?: string;
  weekday?: string;
}):
  | { ok: true; body: RebuildBody }
  | { ok: false; errors: Partial<Record<keyof RebuildBody, RebuildFieldError>> } {
  const frequency = REBUILD_FREQUENCIES.find((value) => value === form.frequency);
  if (!frequency) return { ok: false, errors: { frequency: 'required' } };
  if (frequency === 'off') return { ok: true, body: { frequency } };
  const errors: Partial<Record<keyof RebuildBody, RebuildFieldError>> = {};
  const body: RebuildBody = { frequency };
  const fields: Array<['minute' | 'hour' | 'weekday', number, number]> = [['minute', 0, 59]];
  if (frequency !== 'hourly') fields.push(['hour', 0, 23]);
  if (frequency === 'weekly') fields.push(['weekday', 1, 7]);
  for (const [name, min, max] of fields) {
    const value = wholeNumber(form[name], min, max);
    if (value === 'empty') errors[name] = 'required';
    else if (value === null) errors[name] = 'range';
    else body[name] = value;
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, body };
}

/** A weekday's name, 1 = Monday … 7 = Sunday: "Monday", "lunes". */
export function weekdayName(weekday: number, locale: string): string {
  // 1 January 2024 was a Monday.
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2024, 0, weekday)));
}

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * What a schedule says, as a message key under `Cloud.git.rebuild.every` and its values (the
 * caller translates): daily at 06:30 → `{ key: 'daily', values: { time: '06:30', … } }`.
 * Null when it is off or incomplete.
 */
export function describeRebuild(
  rebuild:
    | { frequency: string; minute: number | null; hour: number | null; weekday: number | null }
    | undefined,
  locale: string,
): {
  key: 'hourly' | 'daily' | 'weekly';
  values: { minute: string; time: string; weekday: string };
} | null {
  if (!rebuild || rebuild.minute === null) return null;
  const minute = pad(rebuild.minute);
  const time = rebuild.hour === null ? '' : `${pad(rebuild.hour)}:${minute}`;
  const weekday = rebuild.weekday === null ? '' : weekdayName(rebuild.weekday, locale);
  const values = { minute, time, weekday };
  if (rebuild.frequency === 'hourly') return { key: 'hourly', values };
  if (rebuild.frequency === 'daily' && time) return { key: 'daily', values };
  if (rebuild.frequency === 'weekly' && time && weekday) return { key: 'weekly', values };
  return null;
}
