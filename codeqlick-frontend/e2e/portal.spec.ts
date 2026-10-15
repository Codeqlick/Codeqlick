import { expect, test } from '@playwright/test';
import { adminHeaders, API_URL, asAdmin, runTag, signIn } from './helpers';

test('the client comments on and approves an update, and the team answers', async ({
  browser,
  request,
  baseURL,
}) => {
  const tag = runTag();
  const client = { email: `e2e-portal-${tag}@codeqlick.test`, password: `client-pass-${tag}-0` };
  const admin = adminHeaders();

  // Set-up through the API: a client, a project with a milestone and an update to approve.
  const user = await request.post(`${API_URL}/admin/users`, {
    headers: admin,
    data: {
      email: client.email,
      name: `Cliente ${tag}`,
      role: 'CLIENT',
      password: client.password,
      locale: 'es',
    },
  });
  expect(user.ok()).toBeTruthy();
  const clientId = ((await user.json()) as { id: string }).id;
  const project = await request.post(`${API_URL}/admin/projects`, {
    headers: admin,
    data: { clientId, name: `Tienda ${tag}`, phase: 'DESIGN', progress: 30 },
  });
  const projectId = ((await project.json()) as { id: string }).id;
  await request.post(`${API_URL}/admin/projects/${projectId}/milestones`, {
    headers: admin,
    data: { title: 'Diseño aprobado', dueDate: '2026-12-01' },
  });
  await request.post(`${API_URL}/admin/projects/${projectId}/updates`, {
    headers: admin,
    data: {
      title: 'Propuesta de portada',
      body: 'Dos opciones: **A** y **B**.',
      requestApproval: true,
    },
  });

  try {
    // The client signs in, sees the project, comments and approves.
    const clientPage = await (await browser.newContext()).newPage();
    await signIn(clientPage, client);
    await clientPage.goto(`/es/portal/projects/${projectId}`);
    await expect(clientPage.getByRole('heading', { level: 1 })).toHaveText(`Tienda ${tag}`);
    await expect(clientPage.getByRole('heading', { name: 'Diseño aprobado' })).toBeVisible();
    const update = clientPage.locator('[id^="update-"]').first();
    await expect(update.getByText('Pendiente de aprobación')).toBeVisible();

    await update.getByText('Escribir un comentario').click();
    await update.getByLabel('Comentario', { exact: true }).fill('Prefiero la B.');
    await update.getByRole('button', { name: 'Enviar comentario' }).click();
    await expect(update.getByText('Prefiero la B.')).toBeVisible();

    await update.getByRole('button', { name: 'Aprobar' }).click();
    await expect(update.getByText(/Aprobado por Cliente/)).toBeVisible();
    await expect(update.getByRole('button', { name: 'Aprobar' })).toHaveCount(0);

    // The team sees it in the admin panel and answers in the same thread.
    const adminContext = await browser.newContext();
    await asAdmin(adminContext, baseURL ?? 'http://localhost:3001');
    const adminPage = await adminContext.newPage();
    await adminPage.goto(`/es/admin/projects/${projectId}`);
    const thread = adminPage.locator('[id^="update-"]').first();
    await expect(thread.getByText(/Aprobado por Cliente/)).toBeVisible();
    await expect(thread.getByText('Prefiero la B.')).toBeVisible();
    await thread.getByText('Escribir un comentario').click();
    await thread.getByLabel('Comentario', { exact: true }).fill('Perfecto, seguimos con la B.');
    await thread.getByRole('button', { name: 'Enviar comentario' }).click();
    await expect(thread.getByText('Perfecto, seguimos con la B.')).toBeVisible();

    // And the client reads the answer.
    await clientPage.reload();
    await expect(clientPage.getByText('Perfecto, seguimos con la B.')).toBeVisible();
  } finally {
    await request.delete(`${API_URL}/admin/projects/${projectId}`, { headers: admin });
    await request.patch(`${API_URL}/admin/users/${clientId}`, {
      headers: admin,
      data: { isActive: false },
    });
  }
});
