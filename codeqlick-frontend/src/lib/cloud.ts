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

/** The Events page's filters (architecture 4.13, Exporting events); the API validates them. */
export type CloudEventFilters = { from?: string; to?: string; action?: string };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reads the filters from a page's or route's query: dates as `YYYY-MM-DD` (what a date input
 * sends; anything else is dropped), the action trimmed and lowercased. Empty values are left out.
 */
export function cloudEventFilters(
  query: Record<string, string | string[] | undefined>,
): CloudEventFilters {
  const first = (value: string | string[] | undefined) =>
    (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
  const filters: CloudEventFilters = {};
  const from = first(query.from);
  const to = first(query.to);
  const action = first(query.action).toLowerCase().slice(0, 60);
  if (DAY.test(from)) filters.from = from;
  if (DAY.test(to)) filters.to = to;
  if (action) filters.action = action;
  return filters;
}

/** The filters as a query string ("?from=…&action=…"), or "" without any. */
export function cloudEventFiltersQuery(filters: CloudEventFilters): string {
  const params = new URLSearchParams();
  for (const key of ['from', 'to', 'action'] as const) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}
