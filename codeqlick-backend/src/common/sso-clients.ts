import type { RealmName } from './realm.js';
import { CODEQLICK_APPS, NEOQLICK_APPS } from './webapps.js';

/**
 * The hosts that get their sessions from the account host by single sign-on (architecture 4.3,
 * decision 108), per realm (4.18): Codeqlick's website (`site`: codeqlick.com, its portal and admin
 * panel) and apps, and Neoqlick's apps. The account hosts themselves are not clients: they are
 * where people sign in.
 */
export const SSO_CLIENTS_BY_REALM = {
  CODEQLICK: ['site', ...CODEQLICK_APPS],
  NEOQLICK: [...NEOQLICK_APPS],
} as const satisfies Record<RealmName, readonly string[]>;

export const SSO_CLIENTS = [
  ...SSO_CLIENTS_BY_REALM.CODEQLICK,
  ...SSO_CLIENTS_BY_REALM.NEOQLICK,
] as const;
export type SsoClient = (typeof SSO_CLIENTS)[number];

export function isSsoClient(value: unknown): value is SsoClient {
  return typeof value === 'string' && (SSO_CLIENTS as readonly string[]).includes(value);
}

/** Whether `client` is a single sign-on client of the account's realm. */
export function isSsoClientOf(realm: RealmName, client: string): boolean {
  return (SSO_CLIENTS_BY_REALM[realm] as readonly string[]).includes(client);
}
