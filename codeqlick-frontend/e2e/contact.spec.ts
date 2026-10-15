import { expect, test } from '@playwright/test';
import { adminHeaders, API_URL, runTag } from './helpers';

test('a visitor sends the contact form and the lead reaches the admin', async ({
  page,
  request,
}) => {
  const tag = runTag();
  const email = `e2e-contact-${tag}@codeqlick.test`;
  await page.goto('/es/contact');
  await page.getByLabel('Nombre').fill(`Visitante ${tag}`);
  await page.getByLabel('Correo electrónico').fill(email);
  await page
    .getByLabel('Mensaje')
    .fill('Queremos una tienda online con recogida en local. ¿Podemos hablar?');
  // Forms sent less than 3 s after the page was served are taken for bots.
  await page.waitForTimeout(3200);
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();
  await expect(page.getByText('¡Gracias! Hemos recibido tu mensaje.')).toBeVisible();

  const leads = await request.get(`${API_URL}/admin/leads?q=${encodeURIComponent(email)}`, {
    headers: adminHeaders(),
  });
  const body = (await leads.json()) as { items: { email: string; status: string }[] };
  expect(body.items).toEqual([expect.objectContaining({ email, status: 'NEW' })]);
});
