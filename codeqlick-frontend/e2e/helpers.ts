import { createHmac } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';

export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000/v1';
export const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? 'admin@codeqlick.com',
  password: process.env.E2E_ADMIN_PASSWORD ?? 'change-me-please-123',
};

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

/** Signs in through the login page, like a person. */
export async function signIn(page: Page, user: { email: string; password: string }, next = '') {
  await page.goto(`/es/login${next ? `?next=${encodeURIComponent(next)}` : ''}`);
  await page.getByLabel('Correo electrónico').fill(user.email);
  await page.getByLabel('Contraseña').fill(user.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'));
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
