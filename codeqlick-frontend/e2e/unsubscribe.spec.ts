import { expect, test } from '@playwright/test';
import { adminHeaders, API_URL, linkIn, mailTo, runTag } from './helpers';

/**
 * The unsubscribe link of an optional email (architecture 4.3, decision 50): the weekly summary's
 * footer leads to a page that turns it off without signing in, and back on with "Undo".
 */
test('a client unsubscribes from the weekly summary from its email, and undoes it', async ({
  page,
  request,
  baseURL,
}) => {
  const tag = runTag();
  const email = `e2e-unsub-${tag}@codeqlick.test`;
  const admin = adminHeaders();

  // A client with news this week, so "send now" sends the summary.
  const user = await request.post(`${API_URL}/admin/users`, {
    headers: admin,
    data: {
      email,
      name: `Cliente ${tag}`,
      role: 'CLIENT',
      password: `client-pass-${tag}-0`,
      locale: 'es',
    },
  });
  expect(user.ok()).toBeTruthy();
  const clientId = ((await user.json()) as { id: string }).id;
  const project = await request.post(`${API_URL}/admin/projects`, {
    headers: admin,
    data: { clientId, name: `Web ${tag}`, phase: 'DESIGN', progress: 30 },
  });
  const projectId = ((await project.json()) as { id: string }).id;

  try {
    await request.post(`${API_URL}/admin/projects/${projectId}/updates`, {
      headers: admin,
      data: { title: 'Primer boceto', body: 'Ya está listo.' },
    });
    const sent = await request.post(`${API_URL}/admin/projects/weekly-digest/${clientId}`, {
      headers: admin,
    });
    expect(((await sent.json()) as { sent: boolean }).sent).toBe(true);

    const mail = await mailTo(email, /resumen semanal/);
    const origin = new URL(baseURL ?? 'http://localhost:3001').origin;
    await page.goto(linkIn(mail, `${origin}/es/email/unsubscribe`));

    // Opening the link changes nothing: it says what it is about and waits for the button.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Preferencias de correo');
    const status = page.getByRole('status');
    await expect(status).toContainText('recibe el resumen semanal de tus proyectos');

    await page.getByRole('button', { name: 'Darme de baja' }).click();
    await expect(status).toContainText('ya no recibirá el resumen semanal');
    await expect(page.getByRole('link', { name: /Mi cuenta/ })).toBeVisible();

    // It stuck: the same link now finds it off.
    await page.reload();
    await expect(status).toContainText('ya estaba dado de baja');
    await page.getByRole('button', { name: 'Volver a suscribirme' }).click();
    await expect(status).toContainText('Te has vuelto a suscribir');
    await expect(page.getByRole('button', { name: 'Darme de baja' })).toBeVisible();
  } finally {
    await request.delete(`${API_URL}/admin/projects/${projectId}`, { headers: admin });
    await request.patch(`${API_URL}/admin/users/${clientId}`, {
      headers: admin,
      data: { isActive: false },
    });
  }
});

test('an unsubscribe link that does not work sends the person to sign in', async ({ page }) => {
  await page.goto('/es/email/unsubscribe?token=bm90LWEtdG9rZW4.bm9wZQ');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Preferencias de correo');
  await expect(page.getByText('Este enlace ya no funciona')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Entrar' })).toHaveAttribute(
    'href',
    /\/es\/login\?next=%2Fes%2Fportal%2Faccount/,
  );
});
