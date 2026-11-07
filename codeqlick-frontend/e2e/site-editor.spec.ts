import { expect, test } from '@playwright/test';
import { adminHeaders, API_URL, runTag, signIn } from './helpers';

// Needs the site builder (codeqlick-sites/builder) next to the API: the editor previews drafts.
test('a client edits their basic website, sees it in the preview and publishes it', async ({
  page,
  request,
}) => {
  const tag = runTag();
  const client = { email: `e2e-editor-${tag}@codeqlick.test`, password: `editor-pass-${tag}-0` };
  const admin = adminHeaders();
  const user = await request.post(`${API_URL}/admin/users`, {
    headers: admin,
    data: { ...client, name: `Lucía ${tag}`, role: 'CLIENT', locale: 'es' },
  });
  expect(user.ok()).toBeTruthy();
  const onboarded = await request.post(`${API_URL}/admin/sites/onboard`, {
    headers: admin,
    data: {
      name: `Lucía ${tag}`,
      email: client.email,
      businessName: `Peluquería ${tag}`,
      slug: `e2e-editor-${tag}`,
      preset: 'peluqueria',
    },
  });
  expect(onboarded.ok()).toBeTruthy();
  const { projectId } = (await onboarded.json()) as { projectId: string };

  await signIn(page, client);
  await page.goto(`/es/portal/projects/${projectId}/site`);
  // A new site has no tax ID or address yet: its legal notice needs them.
  await expect(page.getByText('Completa tus datos legales.')).toBeVisible();
  await page.getByRole('link', { name: 'Abrir el editor' }).click();

  const status = page.getByRole('status').first();
  await expect(status).toHaveText('Sin cambios: tu web publicada está al día.');
  await expect(page.locator('summary', { hasText: 'Datos legales' })).toContainText(
    'Falta completar',
  );

  await page.locator('summary', { hasText: 'Portada' }).click();
  await page.getByLabel('Titular', { exact: true }).fill(`Bienvenida a ${tag}`);
  await expect(status).toHaveText(
    'Guardado en el borrador. Pulsa «Publicar» para que se vea en tu web.',
  );
  // The preview shows the draft's texts as they are typed.
  await expect(
    page.frameLocator('iframe').getByRole('heading', { name: `Bienvenida a ${tag}` }),
  ).toBeVisible();

  // A required field left empty: its part is flagged and the banner leads to it.
  await page.locator('summary', { hasText: 'Negocio y Google' }).click();
  const name = page.getByLabel('Nombre del negocio', { exact: true });
  await name.fill('');
  await page.locator('summary', { hasText: 'Negocio y Google' }).click();
  await expect(page.locator('summary', { hasText: 'Negocio y Google' })).toContainText('Revisar');
  await page.getByRole('button', { name: 'Ir al primero' }).click();
  await expect(name).toBeFocused();
  await name.fill(`Peluquería ${tag}`);
  await expect(status).toHaveText(/Pulsa «Publicar»/);

  // The site page says the changes are not online yet.
  await page.goto(`/es/portal/projects/${projectId}/site`);
  await expect(page.getByText('Tienes cambios sin publicar.')).toBeVisible();
  await page.getByRole('link', { name: 'Revisar y publicar' }).click();
  await page.getByRole('button', { name: 'Publicar' }).click();
  await expect(status).toHaveText('Publicado.');

  await page.goto(`/es/portal/projects/${projectId}/site`);
  await expect(page.getByText('Tienes cambios sin publicar.')).toHaveCount(0);
});
