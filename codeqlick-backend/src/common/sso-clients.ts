import { WEBAPPS } from './webapps.js';

/**
 * The hosts that get their sessions from the account host by single sign-on (architecture 4.3,
 * decision 108): the website (`site`: codeqlick.com, its portal and admin panel) and every web app.
 * The account host itself is not a client: it is where people sign in.
 */
export const SSO_CLIENTS = ['site', ...WEBAPPS] as const;
export type SsoClient = (typeof SSO_CLIENTS)[number];

export function isSsoClient(value: unknown): value is SsoClient {
  return typeof value === 'string' && (SSO_CLIENTS as readonly string[]).includes(value);
}
