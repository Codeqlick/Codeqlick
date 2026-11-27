import { WEBAPPS } from './webapps.js';

/**
 * The hosts that get their sessions from the account host by single sign-on (architecture 4.3,
 * decision 108): the website (`site`: codeqlick.com, its portal and admin panel) and every web app.
 * The account host itself is not a client: it is where people sign in.
 */
export const SSO_CLIENTS = ['site', ...WEBAPPS] as const;
export type SsoClient = (typeof SSO_CLIENTS)[number];

/**
 * Desktop programs that sign people in with their account through the system browser and a
 * redirect to a port on the person's own machine: Age of Velkara's game and launcher. They have
 * no host, so they are not web apps; their codes carry the redirect address they were issued for.
 */
export const NATIVE_SSO_CLIENTS = ['ageofvelkara'] as const;
export type NativeSsoClient = (typeof NATIVE_SSO_CLIENTS)[number];

/** Every client single sign-on issues codes to: the hosts and the desktop programs. */
export const ALL_SSO_CLIENTS = [...SSO_CLIENTS, ...NATIVE_SSO_CLIENTS] as const;
export type AnySsoClient = (typeof ALL_SSO_CLIENTS)[number];

export function isSsoClient(value: unknown): value is SsoClient {
  return typeof value === 'string' && (SSO_CLIENTS as readonly string[]).includes(value);
}

export function isNativeSsoClient(value: unknown): value is NativeSsoClient {
  return typeof value === 'string' && (NATIVE_SSO_CLIENTS as readonly string[]).includes(value);
}

/**
 * A native client's redirect: exactly `http://127.0.0.1:<port>/callback`, the port 1024–65535
 * written without leading zeros. The numeric loopback address, never the name `localhost`, which a
 * hosts file or resolver could send elsewhere; plain http, because the address never leaves the
 * machine; no port below 1024, which only an administrator can listen on; and nothing else (no
 * userinfo, other path, query or fragment), so the address a code is bound to is one exact string.
 * The website's authorize page applies the same rule.
 */
const LOOPBACK_REDIRECT = /^http:\/\/127\.0\.0\.1:([1-9][0-9]{3,4})\/callback$/;
const MIN_PORT = 1024;
const MAX_PORT = 65535;

export function isLoopbackRedirect(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = LOOPBACK_REDIRECT.exec(value);
  if (!match) return false;
  const port = Number(match[1]);
  return port >= MIN_PORT && port <= MAX_PORT;
}
