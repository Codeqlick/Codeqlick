import { expect, test } from '@playwright/test';
import { accountUrl, linkIn, mailTo, runTag } from './helpers';
import { testPng } from './images';

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

  // The confirmation email's link (on the account host, decision 108) finishes the account and
  // signs the person in there.
  const mail = await mailTo(email, /Confirma/);
  await page.goto(linkIn(mail, accountUrl('/es/register/confirm')));
  await page.getByRole('button', { name: 'Confirmar y entrar' }).click();
  await page.waitForURL(/account\.[^/]+\/es$/);
  await expect(page.getByText(`Sesión iniciada como Ada ${tag}`)).toBeVisible();

  // The website's portal signs them in through the account host, without asking.
  await page.goto('/es/portal');
  await expect(page).toHaveURL(/\/es\/portal$/);
  await expect(page.getByText(`Sesión iniciada como Ada ${tag}`)).toBeVisible();

  // A username of their own: the page says it is free, and taken names are refused.
  await page.goto(accountUrl('/es/profile'));
  const username = page.getByLabel('Nombre de usuario');
  await username.fill('admin');
  await expect(page.getByText('Ese nombre está reservado. Prueba con otro.')).toBeVisible();
  await username.fill(`ada_${tag}`);
  await expect(page.getByText(`@ada_${tag} está libre.`)).toBeVisible();
  await page.getByRole('button', { name: 'Guardar nombre de usuario' }).click();
  await expect(page.getByText(`Listo: ahora eres @ada_${tag}.`)).toBeVisible();
  await page.goto(accountUrl('/es'));
  await expect(page.getByText(`@ada_${tag} · Sesión iniciada como ${email}`)).toBeVisible();
  await page.goto(accountUrl('/es/profile'));

  // A profile photo: it replaces the initials in the account and in the header.
  await page.getByLabel('Elegir foto').setInputFiles({
    name: 'me.png',
    mimeType: 'image/png',
    buffer: testPng(900),
  });
  await expect(page.getByText('Foto de perfil guardada.')).toBeVisible();
  await expect(page.locator('img[src^="/avatar/"]').first()).toBeVisible();
  await page.getByRole('button', { name: 'Quitar foto' }).click();
  await expect(page.locator('img[src^="/avatar/"]')).toHaveCount(0);
});
