import { expect, test } from '@playwright/test';
import { adminHeaders, API_URL, runTag, signIn, totp } from './helpers';

test('an admin turns on two-step verification and then needs a code to sign in', async ({
  page,
  request,
}) => {
  const tag = runTag();
  const admin = { email: `e2e-2fa-${tag}@codeqlick.test`, password: `admin-2fa-${tag}-0` };
  const created = await request.post(`${API_URL}/admin/users`, {
    headers: adminHeaders(),
    data: { ...admin, name: `Admin ${tag}`, role: 'ADMIN', locale: 'es' },
  });
  expect(created.ok()).toBeTruthy();

  await signIn(page, admin, '/es/admin/account');
  await page.goto('/es/admin/account');
  await page.getByRole('button', { name: 'Configurar' }).click();
  const secret = (await page
    .locator('code')
    .filter({ hasText: /^[A-Z2-7 ]{16,}$/ })
    .textContent())!;
  await page.getByLabel('Código').fill(totp(secret));
  await page.getByRole('button', { name: 'Activar' }).click();
  await expect(page.getByText(/Guarda tus códigos de recuperación/)).toBeVisible();
  await page.getByRole('button', { name: 'Ya los he guardado' }).click();
  await expect(page.getByText(/^Activada\./)).toBeVisible();

  // Signing in again asks for the code (the next one: a used code is never accepted twice).
  await page.context().clearCookies();
  await page.goto('/es/login');
  await page.getByLabel('Correo electrónico').fill(admin.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(admin.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Verificación en dos pasos' })).toBeVisible();
  await page.getByLabel('Código').fill(totp(secret, Date.now() + 30_000));
  await page.getByRole('button', { name: 'Verificar' }).click();
  await page.waitForURL(/\/es\/admin/);
  await expect(page).not.toHaveURL(/login/);
});
