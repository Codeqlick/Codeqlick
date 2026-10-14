/** Locale-aware formatting helpers (pure; usable on server and client). */

const BCP47: Record<string, string> = { en: 'en-GB', es: 'es-ES' };

function tag(locale: string): string {
  return BCP47[locale] ?? locale;
}

export function formatDate(value: string | null | undefined, locale: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(tag(locale), { dateStyle: 'medium', timeZone: 'UTC' }).format(
    date,
  );
}

export function formatDateTime(value: string | null | undefined, locale: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(tag(locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Madrid',
  }).format(date);
}

/** ISO date (yyyy-mm-dd) for <input type="date"> values. */
export function toDateInput(value: string | null | undefined): string {
  if (!value) return '';
  return value.slice(0, 10);
}

/** Parses a `?page=` search param into a positive integer (default 1). */
export function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = Number.parseInt(raw ?? '1', 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** File size for people: 870 B, 12 KB, 1.4 MB. */
export function formatBytes(bytes: number, locale: string): string {
  const number = new Intl.NumberFormat(tag(locale), { maximumFractionDigits: 1 });
  if (bytes < 1024) return `${number.format(bytes)} B`;
  if (bytes < 1024 * 1024) return `${number.format(Math.round(bytes / 1024))} KB`;
  return `${number.format(bytes / (1024 * 1024))} MB`;
}
