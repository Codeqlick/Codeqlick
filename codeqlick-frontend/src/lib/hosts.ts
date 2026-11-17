/**
 * The host table (architecture 4.18): which brand and which kind of host a request came to.
 * Neoqlick's hosts are decided by `NEOQLICK_URL` (`https://neoqlick.com`, or
 * `http://neoqlick.localhost:3000` in development): its apex and every subdomain of it belong to
 * the brand; every other host is Codeqlick's, as before. Unset (staging), there are no Neoqlick
 * hosts. Pure functions over the host (and, by default, `process.env.NEOQLICK_URL`), so the proxy,
 * the server and the tests share them: no `server-only` and no env module here.
 */

/** The apps of Codeqlick (the 18+ ones leave its hosts in PR C) and of Neoqlick. */
export const CODEQLICK_APPS = ['meetings', 'citas', 'cloud'] as const;
export const NEOQLICK_APPS = ['cruising', 'swipe', 'videochat'] as const;

export type Brand = 'codeqlick' | 'neoqlick';
export type HostKind = 'site' | 'app' | 'account' | 'portal';
export type HostClass = { brand: Brand; kind: HostKind };

/** The first label of the account host, and of nothing else. */
const ACCOUNT_LABEL = 'account';

/** `https://neoqlick.com` → `neoqlick.com`; `http://neoqlick.localhost:3000` keeps its port. */
export function hostOfUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.toLowerCase().replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

/** Neoqlick's main host from `NEOQLICK_URL`, or null where there are no Neoqlick hosts. */
export function neoqlickMainHost(
  url: string | null | undefined = process.env.NEOQLICK_URL,
): string | null {
  return hostOfUrl(url);
}

/** The brand of a host: Neoqlick's apex and its subdomains, else Codeqlick. */
export function brandOfHost(
  host: string | null | undefined,
  neoqlick: string | null = neoqlickMainHost(),
): Brand {
  if (!host || !neoqlick) return 'codeqlick';
  const name = host
    .trim()
    .toLowerCase()
    .replace(/:(443|80)$/, '');
  return name === neoqlick || name.endsWith(`.${neoqlick}`) ? 'neoqlick' : 'codeqlick';
}

/**
 * Classifies a host: the account host (first label `account`), an app's host (the first label is
 * one of the brand's apps), the portal (Neoqlick's apex or `www`) or the website (anything else of
 * Codeqlick; an unknown Neoqlick subdomain is a `site` too, which the proxy answers with 404).
 */
export function classifyHost(
  host: string | null | undefined,
  neoqlick: string | null = neoqlickMainHost(),
): HostClass {
  const brand = brandOfHost(host, neoqlick);
  if (!host) return { brand, kind: 'site' };
  const name = host
    .trim()
    .toLowerCase()
    .replace(/:(443|80)$/, '');
  const first = name.split(':')[0]?.split('.')[0] ?? '';
  if (first === ACCOUNT_LABEL) return { brand, kind: 'account' };
  const apps: readonly string[] =
    brand === 'neoqlick' ? NEOQLICK_APPS : [...CODEQLICK_APPS, ...NEOQLICK_APPS];
  if (apps.includes(first)) return { brand, kind: 'app' };
  if (brand === 'neoqlick' && neoqlick && (name === neoqlick || name === `www.${neoqlick}`)) {
    return { brand, kind: 'portal' };
  }
  return { brand, kind: 'site' };
}
