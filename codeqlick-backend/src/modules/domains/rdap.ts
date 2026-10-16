/** IANA's RDAP bootstrap (RFC 9224): which RDAP server answers for each TLD. */
export type RdapBootstrap = { services: Array<[string[], string[]]> };

/** The RDAP URL of a domain from the bootstrap, or null when its TLD has no RDAP (e.g. `.es`). */
export function rdapUrl(bootstrap: RdapBootstrap, domain: string): string | null {
  const tld = domain.split('.').at(-1)?.toLowerCase();
  const service = bootstrap.services.find(([tlds]) => tlds.includes(tld ?? ''));
  const base = service?.[1].find((url) => url.startsWith('https://')) ?? service?.[1][0];
  return base ? `${base.replace(/\/?$/, '/')}domain/${domain}` : null;
}

/** The expiration event of an RDAP domain answer (RFC 9083), as a `yyyy-mm-dd` day. */
export function expiryFromRdap(body: unknown): string | null {
  const events = (body as { events?: Array<{ eventAction?: string; eventDate?: string }> })?.events;
  const event = events?.find((item) => item.eventAction === 'expiration');
  if (!event?.eventDate) return null;
  const date = new Date(event.eventDate);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/** Whole days from `now` (Madrid day) to `day`; negative once it has passed. */
export function daysUntil(day: string, now: Date): number {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(now);
  return Math.round(
    (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
}

/** The reminder due (30 or 7 days before), or null; `warnedFor` is the last one sent. */
export function reminderDue(day: string, now: Date, warnedFor: string | null): 30 | 7 | null {
  const left = daysUntil(day, now);
  if (left < 0) return null;
  if (left <= 7) return warnedFor === `${day}:7` ? null : 7;
  if (left <= 30) return warnedFor === `${day}:30` || warnedFor === `${day}:7` ? null : 30;
  return null;
}
