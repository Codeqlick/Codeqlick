import { expect, test } from '@playwright/test';
import { accountUrl, adminHeaders, API_URL, runTag } from './helpers';

/**
 * Single sign-on (decision 108): signing in once on the account host signs every other host in
 * through its own invisible round trip, each with a session of its own.
 */
test('signing in once on the account host opens the website and the apps without asking again', async ({
  page,
  request,
  baseURL,
}) => {
  const tag = runTag();
  const client = { email: `e2e-sso-${tag}@codeqlick.test`, password: `client-sso-${tag}-0` };
  const created = await request.post(`${API_URL}/admin/users`, {
    headers: adminHeaders(),
    data: { ...client, name: `SSO ${tag}`, role: 'CLIENT', locale: 'es' },
  });
  expect(created.ok()).toBeTruthy();

  // An app's "Sign in" link (a client-side Link, prefetched) leads to the account host's sign-in.
  const videochat = (baseURL ?? '').replace('://', '://videochat.');
  await page.goto(`${videochat}/en`);
  await page.getByRole('main').getByRole('link', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/account\.[^/]+\/en\/login\?next=/);

  // Signed in on the account host itself.
  await page.goto(accountUrl('/es/login'));
  await page.getByLabel('Correo electrónico').fill(client.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(client.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL(/account\.[^/]+\/es$/);
  await expect(page.getByText(`Sesión iniciada como SSO ${tag}`)).toBeVisible();

  // The website's portal: no sign-in page on the way, and its own cookies on its own host.
  await page.goto('/es/portal');
  await expect(page).toHaveURL(/\/es\/portal$/);
  await expect(page.getByText(`Sesión iniciada como SSO ${tag}`)).toBeVisible();
  const siteCookies = await page.context().cookies(baseURL);
  expect(siteCookies.map((cookie) => cookie.name)).toEqual(
    expect.arrayContaining(['cq_at', 'cq_rt']),
  );
  expect(siteCookies.find((cookie) => cookie.name === 'cq_rt')?.domain).not.toMatch(/^\./);
  // The flow's state cookie is gone once used.
  expect(siteCookies.some((cookie) => cookie.name.startsWith('cq_sso_'))).toBe(false);

  // An app's host: its protected console opens straight away.
  const cloud = (baseURL ?? '').replace('://', '://cloud.');
  await page.goto(`${cloud}/es/console`);
  await expect(page).toHaveURL(/cloud\.[^/]+\/es\/console$/);
  await expect(page.getByLabel('Contraseña', { exact: true })).toHaveCount(0);

  // The account's security page lists one session per host of this browser.
  await page.goto(accountUrl('/es/security'));
  const sessions = page.getByRole('region', { name: 'Sesiones abiertas' });
  await expect(sessions.getByText(/· Cuenta de Codeqlick/)).toBeVisible();
  await expect(sessions.getByText(/· codeqlick\.com/)).toBeVisible();
  await expect(sessions.getByText(/· Cloud/)).toBeVisible();

  // A forged callback (unknown state) is refused without signing anyone in.
  await page.context().clearCookies();
  await page.goto(`/es/auth/callback?code=${'a'.repeat(43)}&state=${'b'.repeat(43)}`);
  await expect(page).toHaveURL(/\/es\/auth\/failed/);
  await expect(
    page.getByRole('heading', { name: 'No se completó el inicio de sesión' }),
  ).toBeVisible();

  await request.patch(`${API_URL}/admin/users/${((await created.json()) as { id: string }).id}`, {
    headers: adminHeaders(),
    data: { isActive: false },
  });
});
