import { request } from '@playwright/test';
import { ADMIN, API_URL } from './helpers';

/*
 * Signs the admin in once for the whole run (the API allows 5 logins per minute and per IP): the
 * tests reuse the token for API set-up and as the admin's session cookie in the browser.
 */
export default async function globalSetup() {
  const context = await request.newContext();
  const response = await context.post(`${API_URL}/auth/login`, { data: ADMIN });
  if (!response.ok()) throw new Error(`Admin login failed: ${response.status()}`);
  const { accessToken } = (await response.json()) as { accessToken: string };
  process.env.E2E_ADMIN_TOKEN = accessToken;
  await context.dispose();
}
