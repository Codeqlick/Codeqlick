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

/** A deployment's id as the API gives it (a UUID); anything else in the address is a 404. */
export function isDeploymentId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Rows the Files tab shows at first, and how many more each "Show more" adds. */
export const FILE_ROWS_STEP = 500;

/**
 * The files whose path contains every word of `query` (split on spaces), ignoring case. An empty
 * query returns the same array, so a memoised list doesn't change.
 */
export function filterFiles<T extends { path: string }>(
  items: readonly T[],
  query: string,
): readonly T[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return items;
  return items.filter((item) => {
    const path = item.path.toLowerCase();
    return words.every((word) => path.includes(word));
  });
}

/** How a changed file's size moved: "+1.5 KB", "−512 B" (a true minus sign) or "±0 B". */
export function formatSizeChange(size: number, previousSize: number, locale: string): string {
  const delta = size - previousSize;
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±';
  return `${sign}${formatBytes(Math.abs(delta), locale)}`;
}
