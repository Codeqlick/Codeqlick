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
