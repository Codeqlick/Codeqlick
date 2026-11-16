const DAY_MS = 24 * 60 * 60 * 1000;
/** RFC 9116 recommends an `Expires` less than a year ahead. */
export const SECURITY_TXT_LIFETIME_DAYS = 364;

export interface SecurityTxtInput {
  contact: string;
  /** The address this copy was fetched from. */
  canonical: string;
  /** The disclosure policy page. */
  policy: string;
  now?: Date;
}

/**
 * security.txt (RFC 9116, architecture 6.2): where to report a vulnerability. `Expires` is made
 * from the request's time, so the file never goes stale and needs no yearly update.
 */
export function securityTxt({ contact, canonical, policy, now = new Date() }: SecurityTxtInput) {
  const expires = new Date(now.getTime() + SECURITY_TXT_LIFETIME_DAYS * DAY_MS);
  return [
    `Contact: mailto:${contact}`,
    `Expires: ${expires.toISOString().replace(/\.\d{3}Z$/, 'Z')}`,
    'Preferred-Languages: en, es',
    `Canonical: ${canonical}`,
    `Policy: ${policy}`,
    '',
  ].join('\n');
}

/** The URL a request reached, as the visitor sees it (Nginx sets the forwarded headers). */
export function requestedUrl(headers: Headers, path: string): string | null {
  const host = headers.get('x-forwarded-host')?.split(',')[0]?.trim() || headers.get('host');
  if (!host || !/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return null;
  const proto = headers.get('x-forwarded-proto') === 'http' ? 'http' : 'https';
  return `${proto}://${host}${path}`;
}
