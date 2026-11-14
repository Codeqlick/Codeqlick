import { expect, test } from '@playwright/test';
import { adminHeaders, API_URL, asAdmin, runTag } from './helpers';

/*
 * The admin panel: every section opens without an error, the team publishes a blog post that
 * visitors then read, and an error the website reports shows up in Errores to be resolved.
 */
test.use({
  launchOptions: { executablePath: process.env.E2E_CHROMIUM_PATH || undefined },
});

test('every admin section opens', async ({ page, context, baseURL }) => {
  test.setTimeout(120_000);
  await asAdmin(context, baseURL!);
  await page.goto('/es/admin');
  const nav = page.getByRole('navigation', { name: 'Secciones' });
  const hrefs = await nav
    .getByRole('link')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
  expect(hrefs.length).toBeGreaterThan(15);
  for (const href of hrefs) {
    const response = await page.goto(href);
    expect(response?.status(), href).toBeLessThan(400);
    await expect(page.getByRole('heading', { level: 1 }).first(), href).toBeVisible();
    await expect(page.getByText('Algo ha fallado por nuestra parte.'), href).toBeHidden();
  }
});

test('the team publishes a blog post and visitors read it', async ({
  page,
  context,
  baseURL,
  request,
}) => {
  const tag = runTag();
  const slug = `e2e-post-${tag}`;
  await asAdmin(context, baseURL!);
  try {
    await page.goto('/es/admin/posts/new');
    await page.getByLabel('Slug').fill(slug);
    await page.getByRole('combobox', { name: 'Estado' }).selectOption('PUBLISHED');
    const en = page.getByRole('group', { name: 'Inglés' });
    await en.getByLabel('Título').fill(`Shipping on Fridays ${tag}`);
    await en.getByLabel('Extracto').fill('Why we are not afraid of it.');
    await en.getByLabel('Contenido (Markdown)').fill('## Small changes\n\nThey are easy to undo.');
    const es = page.getByRole('group', { name: 'Español (opcional)' });
    await es.getByLabel('Título').fill(`Publicar en viernes ${tag}`);
    await es.getByLabel('Extracto').fill('Por qué no nos da miedo.');
    await es.getByLabel('Contenido (Markdown)').fill('## Cambios pequeños\n\nSe deshacen fácil.');
    await page.getByRole('button', { name: 'Crear', exact: true }).click();
    await expect(page).not.toHaveURL(/\/new$/);

    const visitor = await context.browser()!.newPage({ baseURL });
    await visitor.goto(`/es/blog/${slug}`);
    await expect(
      visitor.getByRole('heading', { level: 1, name: `Publicar en viernes ${tag}` }),
    ).toBeVisible();
    await expect(visitor.getByRole('heading', { name: 'Cambios pequeños' })).toBeVisible();
    await visitor.close();
  } finally {
    const list = await request.get(`${API_URL}/admin/posts?pageSize=100`, {
      headers: adminHeaders(),
    });
    const { items } = (await list.json()) as { items: Array<{ id: string; slug: string }> };
    for (const post of items.filter((item) => item.slug === slug)) {
      await request.delete(`${API_URL}/admin/posts/${post.id}`, { headers: adminHeaders() });
    }
  }
});

test('a post edited days after publication shows when it was updated', async ({
  page,
  request,
}) => {
  const tag = runTag();
  const slug = `e2e-post-updated-${tag}`;
  const translations = (title: string) => [
    { locale: 'en', title, excerpt: 'Before and after.', content: 'Body.' },
    { locale: 'es', title: `Actualizado ${tag}`, excerpt: 'Antes y después.', content: 'Cuerpo.' },
  ];
  const created = await request.post(`${API_URL}/admin/posts`, {
    headers: adminHeaders(),
    data: {
      slug,
      status: 'PUBLISHED',
      publishedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      translations: translations(`Updated ${tag}`),
    },
  });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: string };
  try {
    const edited = await request.patch(`${API_URL}/admin/posts/${id}`, {
      headers: adminHeaders(),
      data: { translations: translations(`Updated again ${tag}`) },
    });
    expect(edited.status()).toBe(200);

    await page.goto(`/es/blog/${slug}`);
    await expect(page.locator('time', { hasText: /^Publicado el / })).toBeVisible();
    const updated = page.locator('time', { hasText: /^Actualizado el / });
    await expect(updated).toBeVisible();
    const dateModified = await updated.getAttribute('datetime');
    expect(dateModified).toBeTruthy();
    const structured = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((scripts) =>
        scripts
          .map((script) => JSON.parse(script.textContent ?? '{}') as Record<string, unknown>)
          .find((data) => data['@type'] === 'BlogPosting'),
      );
    expect(structured?.dateModified).toBe(dateModified);
  } finally {
    await request.delete(`${API_URL}/admin/posts/${id}`, { headers: adminHeaders() });
  }
});

test('an error the website reports shows up in Errores and gets resolved', async ({
  page,
  context,
  baseURL,
  request,
}) => {
  const tag = runTag();
  const message = `TypeError: e2e probe ${tag} is undefined`;
  const reported = await request.post(`${API_URL}/errors`, {
    data: { source: 'browser', message, path: '/es/contact' },
  });
  expect(reported.status()).toBe(204);

  await asAdmin(context, baseURL!);
  await page.goto('/es/admin/errors');
  await page.getByRole('link', { name: message }).click();
  await expect(page).toHaveURL(/\/admin\/errors\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Web (navegador)')).toBeVisible();
  await page.getByRole('button', { name: 'Marcar como resuelto' }).click();
  await expect(page.getByRole('button', { name: 'Volver a abrir' })).toBeVisible();
  await page.goto('/es/admin/errors');
  await expect(page.getByRole('link', { name: message })).toBeHidden();
  await page.goto('/es/admin/errors?status=resolved');
  await expect(page.getByRole('link', { name: message })).toBeVisible();
});
