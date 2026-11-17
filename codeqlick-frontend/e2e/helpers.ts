import { createHmac } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test';

export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000/v1';
export const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? 'admin@codeqlick.com',
  password: process.env.E2E_ADMIN_PASSWORD ?? 'change-me-please-123',
};

/**
 * The account host next to the site under test (decision 108): http://localhost:3000 →
 * http://account.localhost:3000 (browsers resolve *.localhost).
 */
export function accountUrl(path = '', base = process.env.E2E_BASE_URL ?? 'http://localhost:3001') {
  return `${base.replace('://', '://account.')}${path}`;
}

/** A tag that keeps each run's data apart (emails, names). */
export const runTag = () => Math.random().toString(36).slice(2, 8);

function adminToken(): string {
  const token = process.env.E2E_ADMIN_TOKEN;
  if (!token) throw new Error('E2E_ADMIN_TOKEN is missing: global-setup signs the admin in');
  return token;
}

/** Authorization header of the admin (signed in once by global-setup), for test set-up. */
export function adminHeaders() {
  return { Authorization: `Bearer ${adminToken()}` };
}

/** Puts the admin's session in a browser context, as if they had signed in. */
export async function asAdmin(context: BrowserContext, baseURL: string) {
  await context.addCookies([{ name: 'cq_at', value: adminToken(), url: baseURL, httpOnly: true }]);
}

/**
 * Signs in through the login page, like a person. The API allows 5 logins per minute and per IP,
 * and every test signs in from the same machine: when the page says to wait, it waits out the
 * minute (adding it to the test's time limit) and tries again.
 */
export async function signIn(page: Page, user: { email: string; password: string }, next = '') {
  const rateLimited = page.getByText('Demasiados intentos', { exact: false });
  for (let attempt = 0; ; attempt++) {
    await page.goto(`/es/login${next ? `?next=${encodeURIComponent(next)}` : ''}`);
    await page.getByLabel('Correo electrónico').fill(user.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(user.password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    // Single sign-on (decision 108) goes on through `authorize` and the callback: wait for the
    // page it lands on, so the next navigation doesn't cut that chain short.
    const signedIn = page.waitForURL(
      (url) => !/\/(login|authorize|auth\/callback)$/.test(url.pathname),
      { waitUntil: 'load' },
    );
    const toldToWait = rateLimited.waitFor();
    // Whichever comes second is dropped: keep its later failure from going unhandled.
    for (const pending of [signedIn, toldToWait]) pending.catch(() => {});
    const outcome = await Promise.race([
      signedIn.then(() => 'in' as const),
      toldToWait.then(() => 'wait' as const),
    ]);
    if (outcome === 'in') return;
    if (attempt === 2) throw new Error('Login still rate limited after waiting');
    test.info().setTimeout(test.info().timeout + 65_000);
    await page.waitForTimeout(61_000);
  }
}

/**
 * Signs a person in through the API and returns their access token. Like `signIn`, it waits out
 * the API's 5 logins a minute per IP (shared by every flow) when it is told to.
 */
export async function apiLogin(
  request: APIRequestContext,
  user: { email: string; password: string },
  realm?: 'NEOQLICK',
): Promise<string> {
  const headers = realm ? { ...realmHeaders(realm), ...anonymousIp() } : undefined;
  let login = await request.post(`${API_URL}/auth/login`, { data: user, headers });
  if (login.status() === 429) {
    test.info().setTimeout(test.info().timeout + 65_000);
    await new Promise((resolve) => setTimeout(resolve, 61_000));
    login = await request.post(`${API_URL}/auth/login`, { data: user, headers });
  }
  expect(login.ok()).toBeTruthy();
  return ((await login.json()) as { accessToken: string }).accessToken;
}

/**
 * Neoqlick's hosts (architecture 4.18): http://localhost:3001 → http://cruising.neoqlick.localhost:3001
 * (browsers resolve *.localhost). Without `name`, the portal.
 */
export function neoqlickUrl(name = '', base = process.env.E2E_BASE_URL ?? 'http://localhost:3001') {
  const url = new URL(base);
  url.hostname = `${name ? `${name}.` : ''}neoqlick.${url.hostname}`;
  return url.origin;
}

/** The account host of Neoqlick. */
export function neoqlickAccountUrl(path = '', base?: string) {
  return `${neoqlickUrl('account', base)}${path}`;
}

/** The header that makes a public account route work on Neoqlick's user base. */
export function realmHeaders(realm: 'NEOQLICK') {
  return { 'X-Realm': realm };
}

/**
 * A made-up client address for a request to the API (it trusts one proxy hop): the sign-up and
 * sign-in limits are per IP, and these set-up calls would otherwise share one bucket.
 */
export function anonymousIp() {
  const octet = () => 1 + Math.floor(Math.random() * 253);
  return { 'X-Forwarded-For': `10.${octet()}.${octet()}.${octet()}` };
}

export type NeoqlickUser = { email: string; password: string; name: string };

/**
 * A new Neoqlick account (a separate user base): it signs up through the API like the account
 * host's form does (terms accepted) and confirms the emailed link. Returns its access token.
 */
export async function createNeoqlickUser(
  request: APIRequestContext,
  user: NeoqlickUser,
): Promise<string> {
  const headers = { ...realmHeaders('NEOQLICK'), ...anonymousIp() };
  const registered = await request.post(`${API_URL}/auth/register`, {
    headers,
    data: {
      name: user.name,
      email: user.email,
      password: user.password,
      locale: 'es',
      acceptPrivacy: true,
      acceptTerms: true,
    },
  });
  expect(registered.ok()).toBeTruthy();
  const mail = await mailTo(user.email, /Confirma/);
  const token = new URL(linkIn(mail, 'http')).searchParams.get('token');
  const confirmed = await request.post(`${API_URL}/auth/register/confirm`, {
    headers,
    data: { token },
  });
  expect(confirmed.ok()).toBeTruthy();
  return ((await confirmed.json()) as { accessToken: string }).accessToken;
}

/** The id of the account an access token belongs to. */
export async function accountId(request: APIRequestContext, token: string): Promise<string> {
  const me = await request.get(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(me.ok()).toBeTruthy();
  return ((await me.json()) as { id: string }).id;
}

/** Deletes a Neoqlick account (the team's tools only reach Codeqlick's): the account's own deletion. */
export async function deleteNeoqlickUser(request: APIRequestContext, user: NeoqlickUser) {
  const headers = { ...realmHeaders('NEOQLICK'), ...anonymousIp() };
  const login = await request.post(`${API_URL}/auth/login`, { headers, data: user });
  if (!login.ok()) return;
  const { accessToken } = (await login.json()) as { accessToken: string };
  await request.delete(`${API_URL}/auth/me`, {
    headers: { ...headers, Authorization: `Bearer ${accessToken}` },
    data: { password: user.password },
  });
}

/** Where the API writes the emails it sends (MAIL_OUTBOX_DIR, tests only). */
const OUTBOX = process.env.E2E_MAIL_OUTBOX;

export type SentMail = { to: string; subject: string; text: string };

/** The newest email to `to` whose subject matches, waiting up to 15 s for it to be sent. */
export async function mailTo(to: string, subject: RegExp): Promise<SentMail> {
  if (!OUTBOX) throw new Error('E2E_MAIL_OUTBOX is missing: the API must write emails there');
  const deadline = Date.now() + 15_000;
  for (;;) {
    const names = existsSync(OUTBOX) ? readdirSync(OUTBOX).sort().reverse() : [];
    for (const name of names) {
      const mail = JSON.parse(readFileSync(join(OUTBOX, name), 'utf8')) as SentMail;
      if (mail.to === to && subject.test(mail.subject)) return mail;
    }
    if (Date.now() > deadline) throw new Error(`No email to ${to} matching ${subject}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/** The first link in an email's text that starts with `prefix`. */
export function linkIn(mail: SentMail, prefix: string): string {
  const found = mail.text.match(/https?:\/\/\S+/g)?.find((url) => url.startsWith(prefix));
  if (!found) throw new Error(`No ${prefix} link in "${mail.subject}"`);
  return found;
}

/** The authenticator app's 6-digit code (RFC 6238: SHA-1, 30 s) for a base32 secret. */
export function totp(secret: string, at = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret.replace(/[\s=]/g, '').toUpperCase())
    bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((byte) => Number.parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const hash = createHmac('sha1', key).update(counter).digest();
  const offset = hash[hash.length - 1]! & 0xf;
  return ((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}
