/**
 * Realms (architecture 4.18, decision 124): two user bases in one database. CODEQLICK is the
 * website, portal, Cloud, Citas and Meetings; NEOQLICK is the 18+ apps.
 */
export const REALMS = ['CODEQLICK', 'NEOQLICK'] as const;
export type RealmName = (typeof REALMS)[number];

/** Header the BFF sets on the public account routes of a Neoqlick host. */
export const REALM_HEADER = 'x-realm';

/**
 * The realm a public account route (sign-in, sign-up, reset…) works on: NEOQLICK only for
 * `X-Realm: NEOQLICK`; anything else, or no header, is CODEQLICK. Choosing it by hand gains
 * nothing: the credentials still have to belong to an account of that realm.
 */
export function realmFromHeader(value: string | string[] | undefined): RealmName {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim().toUpperCase() === 'NEOQLICK' ? 'NEOQLICK' : 'CODEQLICK';
}

export function isRealm(value: unknown): value is RealmName {
  return typeof value === 'string' && (REALMS as readonly string[]).includes(value);
}
