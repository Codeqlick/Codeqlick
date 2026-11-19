import { expect, test } from '@playwright/test';
import { adminHeaders, API_URL, runTag, signIn } from './helpers';

/*
 * Menu on its own host (menu.localhost): the owner signs in and creates a menu with an item and
 * its allergens, edits the item and marks it sold out; a visitor opens the short link, sees the
 * page (allergens in words, the price for the language), sends a report and meets the neutral 404
 * of a link that doesn't exist.
 */
function menuUrl(baseURL: string | undefined): string {
  const url = new URL(baseURL ?? 'http://localhost:3001');
  url.hostname = `menu.${url.hostname}`;
  return url.origin;
}

test('an owner publishes a menu and a visitor reads it, reports it and meets the 404', async ({
  browser,
  request,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const tag = runTag();
  const base = menuUrl(baseURL);
  const owner = { email: `e2e-menu-${tag}@codeqlick.test`, password: `menu-pass-${tag}-0` };
  const created = await request.post(`${API_URL}/admin/users`, {
    headers: adminHeaders(),
    data: { ...owner, name: `Eva ${tag}`, role: 'CLIENT', locale: 'es' },
  });
  expect(created.ok()).toBeTruthy();
  const ownerId = ((await created.json()) as { id: string }).id;
  const slug = `bar-${tag}`;

  const ownerContext = await browser.newContext({ baseURL: base });
  const visitorContext = await browser.newContext({ baseURL: base });
  try {
    const host = await ownerContext.newPage();
    await signIn(host, owner, '/es/menu');
    await expect(host).toHaveURL(`${base}/es`);

    // Signed in with no menu yet: one "Nueva carta" (the empty state's).
    await expect(host.getByRole('link', { name: 'Nueva carta' })).toHaveCount(1);
    await host.getByRole('link', { name: 'Nueva carta' }).click();
    await expect(host).toHaveURL(`${base}/es/editar/nueva`);

    // The link is suggested from the name; the content is written next to its live preview.
    await host.getByLabel('Nombre del negocio').fill(`Bar ${tag}`);
    await expect(host.getByLabel('Enlace de la página')).toHaveValue(slug);
    await host.getByLabel('Nombre de la categoría').fill('Entrantes');
    await host.getByLabel('Nombre', { exact: true }).fill('Croquetas');
    await host.getByLabel('Precio').fill('8,50');
    await host.getByText('Alérgenos (0)').click();
    await host.getByLabel('Gluten').check();
    await expect(host.getByText('Alérgenos (1)')).toBeVisible();
    await expect(host.getByText('Contiene: gluten')).toBeVisible();
    await host.getByRole('button', { name: 'Crear la carta' }).click();
    await expect(host).toHaveURL(/\/es\/editar\/[^/]+\?created=1$/);
    await expect(host.getByText('Tu carta ya está en línea')).toBeVisible();

    // Editing an item: the preview follows what is typed; saving says so.
    await host.getByLabel('Nombre', { exact: true }).fill('Croquetas caseras');
    await expect(host.getByText('Croquetas caseras').first()).toBeVisible();
    // A setting (the title) and the content change in one save.
    await host.getByLabel('Título de la página').fill(`Carta de ${tag}`);
    await host.getByRole('button', { name: 'Guardar' }).click();
    await expect(host.getByText('Guardado. La página está al día.')).toBeVisible();
    const menuId = host.url().match(/\/editar\/([^/?]+)/)?.[1];
    expect(menuId).toBeTruthy();

    // A visitor opens the short link (what the QR carries): the menu's language, the price in
    // the menu's currency, the allergens in words and the allergen note.
    const visitor = await visitorContext.newPage();
    await visitor.goto(`/${slug}`);
    await expect(visitor).toHaveURL(`${base}/es/${slug}`);
    await expect(visitor.getByRole('heading', { level: 1, name: `Bar ${tag}` })).toBeVisible();
    await expect(visitor.getByText('Croquetas caseras')).toBeVisible();
    await expect(visitor.getByText(`Carta de ${tag}`, { exact: true })).toBeVisible();
    await expect(visitor.getByText('8,50', { exact: false })).toBeVisible();
    await expect(visitor.getByText('Contiene: gluten')).toBeVisible();
    await expect(
      visitor.getByText('Si tienes alguna alergia o intolerancia, pregúntanos.'),
    ).toBeVisible();
    await expect(visitor.getByRole('link', { name: 'Hecho con Codeqlick' })).toBeVisible();

    // The quick availability page: one tap and the page says "Agotado".
    await host.goto(`/es/disponibilidad/${menuId}`);
    await host.getByRole('switch', { name: /Agotado/ }).click();
    await expect(host.getByRole('switch', { name: /Agotado/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(async () => {
      await visitor.reload();
      await expect(visitor.getByText('Agotado')).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });

    // The report form (no sign-in): the 3-second rule of the public forms, then a thank you.
    await visitor.getByRole('link', { name: 'Denunciar esta carta' }).click();
    await expect(visitor).toHaveURL(`${base}/es/reportar?menu=${slug}`);
    await visitor.getByLabel('Qué ocurre').fill('Este negocio no existe y copia a otro.');
    await visitor.waitForTimeout(3000);
    await visitor.getByRole('button', { name: 'Enviar denuncia' }).click();
    await expect(visitor.getByText('Gracias. Hemos recibido tu denuncia')).toBeVisible();

    // A link that doesn't exist: one neutral 404.
    const missing = await visitor.goto(`/es/no-existe-${tag}`);
    expect(missing?.status()).toBe(404);
    await expect(
      visitor.getByRole('heading', { name: 'Esta carta no está disponible' }),
    ).toBeVisible();
    // Next.js adds its own noindex to a not-found page next to the layout's: every one says noindex.
    const robots = await visitor
      .locator('meta[name="robots"]')
      .evaluateAll((metas) => metas.map((meta) => meta.getAttribute('content') ?? ''));
    expect(robots.length).toBeGreaterThan(0);
    for (const content of robots) expect(content).toMatch(/noindex/);

    // Pausing the page makes it answer like a missing one.
    await host.goto('/es');
    await host.getByRole('button', { name: 'Pausar' }).click();
    await expect(host.getByText('En pausa')).toBeVisible();
    await expect(async () => {
      const paused = await visitor.goto(`/es/${slug}`);
      expect(paused?.status()).toBe(404);
    }).toPass({ timeout: 15_000 });
  } finally {
    await ownerContext.close();
    await visitorContext.close();
    await request.delete(`${API_URL}/admin/users/${ownerId}`, { headers: adminHeaders() });
  }
});

test('robots.txt of the menu host allows the public pages and hides the app', async ({
  page,
  baseURL,
}) => {
  const base = menuUrl(baseURL);
  const robots = await page.goto(`${base}/robots.txt`);
  expect(robots?.ok()).toBeTruthy();
  const text = (await page.textContent('body')) ?? '';
  expect(text).toContain('Disallow: /editar/');
  expect(text).toContain('Disallow: /cartel/');
  expect(text).toContain('Disallow: /disponibilidad/');
  expect(text).toContain('Disallow: /reportar');
  expect(text).toContain('menu.');
  expect(text).toContain('/sitemap.xml');
  const sitemap = await page.goto(`${base}/sitemap.xml`);
  expect(sitemap?.ok()).toBeTruthy();
});
