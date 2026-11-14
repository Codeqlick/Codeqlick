import { expect, test } from '@playwright/test';
import { adminHeaders, API_URL, asAdmin, runTag } from './helpers';

/*
 * The admin panel: every section opens without an error, the team publishes a blog post that
 * visitors then read, a renamed post's old address redirects to the new one, and an error the
 * website reports shows up in Errores to be resolved.
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

test("a post's old address redirects to its new slug", async ({
  page,
  context,
  baseURL,
  request,
}) => {
  const tag = runTag();
  const oldSlug = `e2e-old-${tag}`;
  const newSlug = `e2e-new-${tag}`;
  await asAdmin(context, baseURL!);
  try {
    await page.goto('/es/admin/posts/new');
    await page.getByLabel('Slug').fill(oldSlug);
    await page.getByRole('combobox', { name: 'Estado' }).selectOption('PUBLISHED');
    const en = page.getByRole('group', { name: 'Inglés' });
    await en.getByLabel('Título').fill(`Renamed post ${tag}`);
    await en.getByLabel('Extracto').fill('Its address changes.');
    await en.getByLabel('Contenido (Markdown)').fill('Old links keep working.');
    await page.getByRole('button', { name: 'Crear', exact: true }).click();
    await expect(page).not.toHaveURL(/\/new$/);

    const list = await request.get(`${API_URL}/admin/posts?pageSize=100`, {
      headers: adminHeaders(),
    });
    const { items } = (await list.json()) as { items: Array<{ id: string; slug: string }> };
    const post = items.find((item) => item.slug === oldSlug);
    expect(post).toBeDefined();

    await page.goto(`/es/admin/posts/${post!.id}`);
    const oldAddresses = page.getByRole('heading', {
      name: 'Direcciones antiguas que redirigen aquí',
    });
    await expect(oldAddresses).toBeHidden();
    await page.getByLabel('Slug').fill(newSlug);
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Cambios guardados.')).toBeVisible();
    await page.reload();
    await expect(oldAddresses).toBeVisible();
    await expect(page.getByText(`/es/blog/${oldSlug}`, { exact: true })).toBeVisible();

    // A permanent redirect, for the page and for its social preview image.
    const moved = await request.get(`/es/blog/${oldSlug}`, { maxRedirects: 0 });
    expect(moved.status()).toBe(308);
    expect(moved.headers()['location']).toMatch(new RegExp(`/es/blog/${newSlug}$`));
    const movedImage = await request.get(`/es/blog/${oldSlug}/og`, { maxRedirects: 0 });
    expect(movedImage.status()).toBe(308);
    expect(movedImage.headers()['location']).toMatch(new RegExp(`/es/blog/${newSlug}/og$`));

    const visitor = await context.browser()!.newPage({ baseURL });
    await visitor.goto(`/en/blog/${oldSlug}`);
    await expect(visitor).toHaveURL(new RegExp(`/en/blog/${newSlug}$`));
    await expect(
      visitor.getByRole('heading', { level: 1, name: `Renamed post ${tag}` }),
    ).toBeVisible();
    await visitor.close();
  } finally {
    const list = await request.get(`${API_URL}/admin/posts?pageSize=100`, {
      headers: adminHeaders(),
    });
    const { items } = (await list.json()) as { items: Array<{ id: string; slug: string }> };
    for (const post of items.filter((item) => [oldSlug, newSlug].includes(item.slug))) {
      await request.delete(`${API_URL}/admin/posts/${post.id}`, { headers: adminHeaders() });
    }
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
