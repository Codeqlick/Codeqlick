import { expect, test } from '@playwright/test';
import { mailTo, runTag } from './helpers';

test('a business asks for a basic website and gets the acknowledgement in Spanish', async ({
  page,
}) => {
  const tag = runTag();
  const email = `e2e-request-${tag}@codeqlick.test`;

  await page.goto('/es/basic-website/request');
  await page.getByLabel('Nombre del negocio').fill(`Barbería ${tag}`);
  await page.getByLabel('¿Qué es?').fill('Barbería');
  await page.getByLabel('Ciudad').fill('Málaga');
  await page.getByLabel('Tu nombre').fill(`Paco ${tag}`);
  await page.getByLabel('Tu email').fill(email);
  // The form refuses what is sent within 3 s of showing it (bots).
  await page.waitForTimeout(3_200);
  await page.getByRole('button', { name: 'Enviar solicitud' }).click();
  await expect(page.getByRole('heading', { name: '¡Recibido!' })).toBeVisible();

  const mail = await mailTo(email, /recibido/i);
  expect(mail.text).toContain(`Negocio: Barbería ${tag} (Barbería, Málaga)`);
});
