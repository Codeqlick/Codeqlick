/**
 * Single sign-on between the account host and every other host (architecture 4.3, decision 108):
 * an authorization-code flow with PKCE, internal to the platform. Pure functions over Web Crypto,
 * so the proxy (no `server-only`) and the route handlers share them and unit tests run them.
 *
 * 1. A client host (the website: `site`, or a web app) that needs a session redirects to the
 *    account host's `/{locale}/authorize` with `client`, `state` and the S256 `code_challenge`,
 *    keeping `state`, the verifier and the path to return to in a host-only cookie.
 * 2. The account host signs the person in if needed, asks the API for a one-time code and sends
 *    the browser to the client's fixed callback, `/{locale}/auth/callback?code=&state=`.
 * 3. The callback checks `state` against its cookie and exchanges the code with the verifier for
 *    a session of its own.
 *
 * A desktop program (a native client) does steps 1 and 3 itself: it opens the system browser at the
 * authorize page with a `redirect_uri` on its own machine (`http://127.0.0.1:<port>/callback`),
 * where step 2 sends the code instead of to a host's callback.
 */
import { ACCOUNT, accountHostFor, isAccountHost, mainHostOf } from './account-host';
import { localeOf } from './locales';
import { WEBAPPS, publicPath, webappForHost, type Webapp } from './webapps';

/** The hosts that get sessions from the account host: the website and every web app. */
export const SSO_CLIENTS = ['site', ...WEBAPPS] as const;
export type SsoClient = (typeof SSO_CLIENTS)[number];

/** Prefix of the cookie that keeps one flow's state on the client host. */
export const SSO_COOKIE_PREFIX = 'cq_sso_';
/** How long a sign-in may take between leaving the client host and coming back. */
export const SSO_COOKIE_MAX_AGE = 10 * 60;

export function isSsoClient(value: unknown): value is SsoClient {
  return typeof value === 'string' && (SSO_CLIENTS as readonly string[]).includes(value);
}

/**
 * Desktop programs that sign in through the system browser and a redirect to the person's own
 * machine (Age of Velkara's game and launcher). They have no host, so they are not web apps.
 */
export const NATIVE_SSO_CLIENTS = ['ageofvelkara'] as const;
export type NativeSsoClient = (typeof NATIVE_SSO_CLIENTS)[number];

export function isNativeSsoClient(value: unknown): value is NativeSsoClient {
  return typeof value === 'string' && (NATIVE_SSO_CLIENTS as readonly string[]).includes(value);
}

/**
 * A native client's redirect: exactly `http://127.0.0.1:<port>/callback`, the port 1024–65535
 * without leading zeros. The numeric loopback address, never the name `localhost`, which a hosts
 * file or resolver could send elsewhere; plain http, because it never leaves the machine; no port
 * below 1024, which only an administrator can listen on; and nothing else (no userinfo, other
 * path, query or fragment), so the address the code is bound to is one exact string. The API
 * applies the same rule.
 */
const LOOPBACK_REDIRECT = /^http:\/\/127\.0\.0\.1:([1-9][0-9]{3,4})\/callback$/;
const MIN_LOOPBACK_PORT = 1024;
const MAX_LOOPBACK_PORT = 65535;

export function isLoopbackRedirect(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = LOOPBACK_REDIRECT.exec(value);
  if (!match) return false;
  const port = Number(match[1]);
  return port >= MIN_LOOPBACK_PORT && port <= MAX_LOOPBACK_PORT;
}

/**
 * Where the account host's forms may end up besides the platform's hosts: a native client's
 * loopback redirect, reached by the redirects that follow a sign-in sent without JavaScript.
 */
export const NATIVE_REDIRECT_SOURCE = 'http://127.0.0.1:*';

/** The client a host is: `site` for the main host, the app for an app's host, null for the account host. */
export function ssoClientForHost(host: string): SsoClient | null {
  if (isAccountHost(host)) return null;
  return webappForHost(host) ?? 'site';
}

/** A client's host next to the account host: never taken from a request's parameters. */
export function clientHost(client: SsoClient, anyHost: string): string {
  const main = mainHostOf(anyHost);
  return client === 'site' ? main : `${client}.${main}`;
}

/** The client's fixed callback, from the account host's own host and protocol. */
export function callbackUrl(
  client: SsoClient,
  accountHost: string,
  protocol: string,
  locale: string,
): string {
  return `${protocol}//${clientHost(client, accountHost)}/${locale}/auth/callback`;
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 32 random bytes as base64url (43 characters): a state or a PKCE verifier. */
export function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

/** RFC 7636's S256: base64url(SHA-256(verifier)). */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

const STATE = /^[A-Za-z0-9_-]{16,128}$/;
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
const CODE = /^[A-Za-z0-9_-]{43}$/;
const VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;

export function isValidState(value: unknown): value is string {
  return typeof value === 'string' && STATE.test(value);
}

export function isValidCode(value: unknown): value is string {
  return typeof value === 'string' && CODE.test(value);
}

/** Constant-time comparison of two strings (state): no early exit on the first difference. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index++) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

/**
 * The path to come back to after signing in, when it is a path of this host in this locale:
 * `/{locale}` or `/{locale}/…`, no protocol-relative `//`, no backslash, nothing that resolves to
 * another origin, not single sign-on's own pages. Anything else is null (the host's home).
 */
export function safeReturnPath(value: unknown, locale: string): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  if (
    value !== `/${locale}` &&
    !value.startsWith(`/${locale}/`) &&
    !value.startsWith(`/${locale}?`)
  )
    return null;
  if (value.includes('//') || value.includes('\\')) return null;
  // Control characters (a newline would let a header be split).
  if ([...value].some((char) => char.charCodeAt(0) < 0x20)) return null;
  try {
    const url = new URL(value, 'http://localhost');
    if (url.origin !== 'http://localhost') return null;
  } catch {
    return null;
  }
  const section = localeOf(value.split(/[?#]/)[0] ?? value)?.section;
  if (section === 'auth' || section === 'login') return null;
  return value;
}

/** What the client host keeps between leaving and coming back. */
export type SsoCookie = { state: string; verifier: string; returnTo: string };

/** The cookie of one flow, named after its state so two tabs don't overwrite each other. */
export function ssoCookieName(state: string): string {
  return `${SSO_COOKIE_PREFIX}${state.slice(0, 16)}`;
}

export function encodeSsoCookie(value: SsoCookie): string {
  return base64url(new TextEncoder().encode(JSON.stringify(value)));
}

export function decodeSsoCookie(raw: string | undefined): SsoCookie | null {
  if (!raw || raw.length > 4096) return null;
  try {
    const padded = raw.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
    const data: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || typeof data !== 'object') return null;
    const { state, verifier, returnTo } = data as Record<string, unknown>;
    if (!isValidState(state) || typeof verifier !== 'string' || !VERIFIER.test(verifier)) {
      return null;
    }
    return { state, verifier, returnTo: typeof returnTo === 'string' ? returnTo : '' };
  } catch {
    return null;
  }
}

/**
 * A validated authorize request (the account host's `/{locale}/authorize`): a web client, whose
 * callback is fixed by its host, or a native client with its loopback redirect.
 */
export type AuthorizeRequest = {
  state: string;
  codeChallenge: string;
  register: boolean;
} & ({ client: SsoClient; redirectUri: null } | { client: NativeSsoClient; redirectUri: string });

/**
 * Reads an authorize request's query; null when anything is missing or malformed. A
 * `redirect_uri` is required of a native client and refused for a web client.
 */
export function parseAuthorizeQuery(query: URLSearchParams): AuthorizeRequest | null {
  const client = query.get('client');
  const state = query.get('state');
  const codeChallenge = query.get('code_challenge');
  const redirectUri = query.get('redirect_uri');
  if (!isValidState(state)) return null;
  if (!codeChallenge || !CHALLENGE.test(codeChallenge)) return null;
  if (query.get('code_challenge_method') !== 'S256') return null;
  const common = { state, codeChallenge, register: query.get('screen') === 'register' };
  if (isSsoClient(client)) return redirectUri === null ? { ...common, client, redirectUri } : null;
  if (isNativeSsoClient(client) && isLoopbackRedirect(redirectUri)) {
    return { ...common, client, redirectUri };
  }
  return null;
}

/**
 * Where the authorize page sends the code: a native client's own loopback address, else the web
 * client's fixed callback on its host (from the account host's own host and protocol).
 */
export function authorizeTarget(
  authorize: AuthorizeRequest,
  code: string,
  accountHost: string,
  protocol: string,
  locale: string,
): string {
  const target = new URL(
    authorize.redirectUri ?? callbackUrl(authorize.client, accountHost, protocol, locale),
  );
  target.searchParams.set('code', code);
  target.searchParams.set('state', authorize.state);
  return target.toString();
}

/**
 * Starts a flow on a client host: the account host's authorize URL, and the cookie to set on this
 * host. `next` is where to come back (checked here: anything that isn't a path of this host in
 * this locale is dropped, and the callback then picks the home).
 */
export async function startSso(input: {
  client: SsoClient;
  host: string;
  protocol: string;
  locale: string;
  next: string | null;
  register?: boolean;
}): Promise<{ url: string; cookie: { name: string; value: string } }> {
  const state = randomToken();
  const verifier = randomToken();
  const challenge = await pkceChallenge(verifier);
  const returnTo = safeReturnPath(input.next, input.locale) ?? '';
  const query = new URLSearchParams({
    client: input.client,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  if (input.register) query.set('screen', 'register');
  return {
    url: `${input.protocol}//${accountHostFor(input.host)}/${input.locale}/authorize?${query}`,
    cookie: { name: ssoCookieName(state), value: encodeSsoCookie({ state, verifier, returnTo }) },
  };
}

/**
 * Where the callback sends the person once signed in: the path they came from (as the short
 * address on an app's host), else the host's home (an app's home, or the role's area on the site).
 */
export function landingPath(
  client: SsoClient,
  locale: string,
  returnTo: string,
  role: 'ADMIN' | 'CLIENT',
): string {
  const path = safeReturnPath(returnTo, locale);
  if (client === 'site') return path ?? `/${locale}/${role === 'ADMIN' ? 'admin' : 'portal'}`;
  if (!path) return `/${locale}`;
  const rest = path.slice(locale.length + 1);
  return `/${locale}${publicPath(client as Webapp, rest)}`;
}

/** What the proxy does with a sign-in address on a client host (`routeSignIn`). */
export type SignInRoute =
  | { action: 'pass' }
  /** Same address on the account host (a full URL), query kept. */
  | { action: 'redirect'; to: string }
  /** Start single sign-on, coming back to `next`. */
  | { action: 'start'; locale: string; next: string | null; register: boolean };

/**
 * The sign-in addresses on a client host while single sign-on is on: `/login` and `/register`
 * start it; the pages reached from emails (`forgot-password`, `reset-password`, `confirm-email`,
 * `register/confirm`, an invitation's `register?invitation=`) and `login/verify` move to the
 * account host with their query (`register/confirm` from an app's host adds `app=`); the account
 * pages too, without the folder's name.
 */
export function routeSignIn(
  pathname: string,
  query: URLSearchParams,
  host: string,
  protocol: string,
): SignInRoute {
  const prefix = localeOf(pathname);
  if (!prefix || isAccountHost(host)) return { action: 'pass' };
  const { locale, section } = prefix;
  const rest = pathname.slice(locale.length + 1 + section.length + 1).replace(/\/$/, '');
  const account = (path: string, extra?: Record<string, string>) => {
    const params = new URLSearchParams(query);
    for (const [key, value] of Object.entries(extra ?? {})) params.set(key, value);
    const search = params.toString();
    return {
      action: 'redirect' as const,
      to: `${protocol}//${accountHostFor(host)}/${locale}${path}${search ? `?${search}` : ''}`,
    };
  };

  if (section === 'login') {
    if (rest === '') return { action: 'start', locale, next: query.get('next'), register: false };
    return account('/login');
  }
  if (section === 'register') {
    if (rest === '/confirm') {
      const app = webappForHost(host);
      return account('/register/confirm', app && !query.get('app') ? { app } : undefined);
    }
    if (rest === '' && query.has('invitation')) return account('/register');
    if (rest === '') return { action: 'start', locale, next: query.get('next'), register: true };
    return { action: 'pass' };
  }
  if (
    section === 'forgot-password' ||
    section === 'reset-password' ||
    section === 'confirm-email'
  ) {
    return account(pathname.slice(locale.length + 1));
  }
  if (section === ACCOUNT) return account(pathname.slice(locale.length + 1 + ACCOUNT.length + 1));
  return { action: 'pass' };
}
