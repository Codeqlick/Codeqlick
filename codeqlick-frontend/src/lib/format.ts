/** Locale-aware formatting helpers (pure; usable on server and client). */

const BCP47: Record<string, string> = { en: 'en-GB', es: 'es-ES' };

/** The studio's time zone: date-times are shown, and typed in the admin panel, in it. */
export const SITE_TIME_ZONE = 'Europe/Madrid';

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
    timeZone: SITE_TIME_ZONE,
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

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** Wall-clock parts of `date` in the site's time zone. */
function siteParts(date: Date): number[] {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SITE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return [get('year'), get('month'), get('day'), get('hour'), get('minute')];
}

/** How far the site's time zone is ahead of UTC at `instant`, in ms (DST-aware). */
function siteOffset(instant: number): number {
  const [year = 0, month = 1, day = 1, hour = 0, minute = 0] = siteParts(new Date(instant));
  return Date.UTC(year, month - 1, day, hour, minute) - Math.floor(instant / 60_000) * 60_000;
}

/** ISO instant → `yyyy-mm-ddThh:mm` in the site's time zone, for <input type="datetime-local">. */
export function toDateTimeInput(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const [year, month, day, hour, minute] = siteParts(date).map((n) => String(n).padStart(2, '0'));
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

/** `yyyy-mm-ddThh:mm` typed in the site's time zone → ISO instant, or null when not a date-time. */
export function fromDateTimeInput(value: string): string | null {
  const match = LOCAL_DATE_TIME.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  const wallClock = Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0);
  // Two passes: the offset can differ on either side of a DST change.
  const first = wallClock - siteOffset(wallClock);
  const instant = wallClock - siteOffset(first);
  return Number.isNaN(instant) ? null : new Date(instant).toISOString();
}

/** Published content whose publication date is still to come. */
export function isScheduled(
  item: { status: string; publishedAt: string | null },
  now = Date.now(),
): boolean {
  return item.status === 'PUBLISHED' && !!item.publishedAt && Date.parse(item.publishedAt) > now;
}
