import 'server-only';
import { env } from '@/lib/env';
import { accountHref } from './account-host';

/** Neoqlick's portal origin (`https://neoqlick.com`), or null where there are no Neoqlick hosts. */
export function portalOrigin(): string | null {
  return env.NEOQLICK_URL ?? null;
}

/** A page of the portal, absolute (`/terms` → `https://neoqlick.com/es/terms`). */
export function portalUrl(locale: string, path = ''): string {
  const origin = portalOrigin();
  return origin ? `${origin}/${locale}${path}` : `/${locale}${path}`;
}

/** A page of Neoqlick's account host (architecture 4.18), absolute: `account.neoqlick.com`. */
export function neoqlickAccountUrl(locale: string, path = ''): string {
  const origin = portalOrigin();
  if (!origin) return `/${locale}/account${path}`;
  const url = new URL(origin);
  return accountHref(locale, path, { host: url.host, protocol: url.protocol }, true);
}
