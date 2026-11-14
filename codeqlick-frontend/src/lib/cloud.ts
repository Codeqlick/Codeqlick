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

export type MonitorKeywordMode = 'CONTAINS' | 'NOT_CONTAINS';

/**
 * An HTTP monitor's "text on the page" from its form (architecture 4.13): `null` when left empty
 * (no text check), the trimmed text when it has 1–100 characters on one line, else `undefined`.
 */
export function monitorKeyword(raw: string): string | null | undefined {
  const text = raw.trim();
  if (text === '') return null;
  return text.length <= 100 && !/[\r\n]/.test(text) ? text : undefined;
}

/** The form's "must contain" / "must not contain" choice; anything else is `CONTAINS`. */
export function monitorKeywordMode(raw: string): MonitorKeywordMode {
  return raw === 'NOT_CONTAINS' ? 'NOT_CONTAINS' : 'CONTAINS';
}
