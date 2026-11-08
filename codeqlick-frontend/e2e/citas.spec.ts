import { expect, test } from '@playwright/test';
import { adminHeaders, API_URL, runTag, signIn } from './helpers';

/*
 * Citas on its own host (citas.localhost): the owner signs in and creates a booking page; a
 * visitor opens its link, picks a day and a time and books; the owner sees the appointment.
 */
function citasUrl(baseURL: string | undefined): string {
  const url = new URL(baseURL ?? 'http://localhost:3001');
  url.hostname = `citas.${url.hostname}`;
  return url.origin;
}

test('an owner publishes a booking page and a visitor books a time', async ({
  browser,
  request,
  baseURL,
}) => {
  test.setTimeout(60_000);
  const tag = runTag();
  const base = citasUrl(baseURL);
  const owner = { email: `e2e-citas-${tag}@codeqlick.test`, password: `citas-pass-${tag}-0` };
  const created = await request.post(`${API_URL}/admin/users`, {
    headers: adminHeaders(),
    data: { ...owner, name: `Ana ${tag}`, role: 'CLIENT', locale: 'es' },
  });
  expect(created.ok()).toBeTruthy();
  const ownerId = ((await created.json()) as { id: string }).id;

  const ownerContext = await browser.newContext({ baseURL: base });
  const visitorContext = await browser.newContext({ baseURL: base });
  try {
    const host = await ownerContext.newPage();
    await signIn(host, owner, '/es/citas');
    await expect(host).toHaveURL(`${base}/es`);

    await host.getByRole('link', { name: 'Nueva página de reservas' }).click();
    await host.getByLabel('Nombre del servicio').fill(`Corte ${tag}`);
    await host.getByLabel('Enlace de la página').fill(`corte-${tag}`.toLowerCase());
    for (const day of ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']) {
      await host.getByLabel(day, { exact: true }).fill('08:00-20:00');
    }
    await host.getByLabel('Antelación mínima (horas)').fill('0');
    await host.getByRole('button', { name: 'Crear la página' }).click();
    await expect(host).toHaveURL(`${base}/es`);
    await expect(host.getByText(`Corte ${tag}`, { exact: true })).toBeVisible();

    // The visitor opens the public page, picks the first free day and time, and books.
    const visitor = await visitorContext.newPage();
    await visitor.goto(`/es/${`corte-${tag}`.toLowerCase()}`);
    await expect(visitor.getByRole('heading', { name: `Corte ${tag}` })).toBeVisible();
    await visitor.getByRole('group', { name: 'Elige la hora' }).getByRole('button').first().click();
    await expect(visitor.getByText('Has elegido:')).toBeVisible();
    await visitor.getByLabel('Nombre', { exact: true }).fill('Bea');
    await visitor.getByLabel('Correo electrónico').fill(`bea-${tag}@codeqlick.test`);
    await visitor.waitForTimeout(3000); // nobody books faster than a person could
    await visitor.getByRole('button', { name: 'Reservar' }).click();
    await expect(visitor.getByText('¡Cita reservada!')).toBeVisible();

    await host.reload();
    await expect(host.getByText('1 cita próxima')).toBeVisible();
    await expect(host.getByText('Bea', { exact: true })).toBeVisible();
  } finally {
    await ownerContext.close();
    await visitorContext.close();
    await request.delete(`${API_URL}/admin/users/${ownerId}`, { headers: adminHeaders() });
  }
});
