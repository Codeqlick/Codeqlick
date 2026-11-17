import { expect, test } from '@playwright/test';

test.describe('public site', () => {
  test('home, navigation and language switch', async ({ page }) => {
    await page.goto('/es');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Redefining information technology in society',
    );
    await page.getByRole('navigation').getByRole('link', { name: 'Nosotros' }).first().click();
    await expect(page).toHaveURL(/\/es\/about$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Software que resuelve problemas reales',
    );
    // The switcher's links are named after the language (aria-label), e.g. "English".
    await page.locator('a[hreflang="en"]').filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/en\/about$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Software that solves real problems',
    );
  });

  test('frequently asked questions open and close', async ({ page }) => {
    await page.goto('/es/contact');
    const answer = page.getByText('Respondemos a los mensajes en un plazo de dos días laborables');
    await expect(answer).toBeHidden();
    await page.getByText('¿Cuánto tardáis en responder?').click();
    await expect(answer).toBeVisible();
  });

  test('blog list, search and an unknown page', async ({ page }) => {
    await page.goto('/es/blog');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.getByRole('searchbox', { name: 'Buscar en el blog' }).fill('palabra-que-no-existe');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page).toHaveURL(/\/es\/blog\?q=palabra-que-no-existe/);
    await expect(page.getByText('Nada para «palabra-que-no-existe»')).toBeVisible();
    const response = await page.goto('/es/does-not-exist');
    expect(response?.status()).toBe(404);
  });

  test('the apps page lists Codeqlick’s apps only', async ({ page }) => {
    await page.goto('/en/apps');
    const apps = page.getByRole('region', { name: 'Codeqlick apps' });
    await expect(apps.getByRole('heading', { level: 2 })).toHaveText([
      'Meetings',
      'Citas',
      'Codeqlick Cloud',
    ]);
  });

  test('nothing of Neoqlick, Cruising, Swipe or Videochat is left in the pages or the sitemap', async ({
    page,
    request,
  }) => {
    const gone = /neoqlick|cruising|swipe|videochat/i;
    for (const path of ['/en', '/es', '/en/apps', '/en/legal', '/en/privacy', '/en/terms']) {
      const response = await page.goto(path);
      if (response?.status() !== 200) continue;
      expect(await page.content(), path).not.toMatch(gone);
    }
    expect(await (await request.get('/sitemap.xml')).text()).not.toMatch(gone);
    expect(await (await request.get('/robots.txt')).text()).not.toMatch(gone);
  });

  test('llms.txt maps the website for AI assistants', async ({ request }) => {
    const response = await request.get('/llms.txt');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('text/plain; charset=utf-8');
    const text = await response.text();
    expect(text.startsWith('# Codeqlick\n')).toBe(true);
    expect(text).toMatch(/\]\(https?:\/\/[^)\s]+\/en\/blog\)/);
    expect(text).not.toContain('€');
  });
});
