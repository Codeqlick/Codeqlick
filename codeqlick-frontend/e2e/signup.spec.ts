import { expect, test } from '@playwright/test';
import { linkIn, mailTo, runTag } from './helpers';

test('a visitor signs up, confirms their email and lands in the portal', async ({ page }) => {
  const tag = runTag();
  const email = `e2e-signup-${tag}@codeqlick.test`;

  await page.goto('/es/register');
  await page.getByLabel('Nombre').fill(`Ada ${tag}`);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(`signup-pass-${tag}-0`);
  await page.getByLabel('Repite la contraseña').fill(`signup-pass-${tag}-0`);
  await page.getByLabel(/He leído y acepto/).check();
  await page.getByRole('button', { name: 'Crear mi cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible();

  // The confirmation email's link finishes the account and signs the person in.
  const mail = await mailTo(email, /Confirma/);
  await page.goto(linkIn(mail, `${new URL(page.url()).origin}/es/register/confirm`));
  await page.getByRole('button', { name: 'Confirmar y entrar' }).click();
  await page.waitForURL(/\/es\/portal/);
  await expect(page.getByText(`Sesión iniciada como Ada ${tag}`)).toBeVisible();
});
