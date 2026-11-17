import { expect, test, type Page } from '@playwright/test';
import { asAdmin, neoqlickUrl } from './helpers';

/*
 * Decision 125, both ways: a Codeqlick page (its HTML and every stylesheet and script it links)
 * never contains "neoqlick", and a Neoqlick page still has its theme (violet, Montserrat titles).
 */
test.use({
  launchOptions: { executablePath: process.env.E2E_CHROMIUM_PATH || undefined },
});

/** The page's HTML plus the text of every stylesheet and script it references. */
async function everythingOf(page: Page): Promise<string> {
  const urls = await page.evaluate(() => [
    ...Array.from(
      document.querySelectorAll('link[rel="stylesheet"]'),
      (link) => (link as HTMLLinkElement).href,
    ),
    ...Array.from(
      document.querySelectorAll('script[src]'),
      (script) => (script as HTMLScriptElement).src,
    ),
  ]);
  const parts = [await page.content()];
  for (const url of urls) parts.push(await (await page.request.get(url)).text());
  return parts.join('\n');
}

for (const path of ['/es', '/en/apps', '/es/login', '/es/work']) {
  test(`Codeqlick ${path} carries no Neoqlick`, async ({ page }) => {
    await page.goto(path);
    expect(await everythingOf(page)).not.toMatch(/neoqlick/i);
  });
}

test('Codeqlick admin carries no Neoqlick', async ({ page, context, baseURL }) => {
  await asAdmin(context, baseURL!);
  await page.goto('/es/admin');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  expect(await everythingOf(page)).not.toMatch(/neoqlick/i);
});

test('a Neoqlick page keeps its theme: violet brand colour and Montserrat titles', async ({
  page,
}) => {
  await page.goto(`${neoqlickUrl()}/es`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-brand', 'neoqlick');
  const theme = await page.evaluate(() => ({
    brand: getComputedStyle(document.documentElement).getPropertyValue('--color-brand').trim(),
    family: getComputedStyle(document.querySelector('h1')!).fontFamily,
  }));
  expect(theme.brand.toLowerCase()).toBe('#7c3aed');
  expect(theme.family).toContain('Montserrat');
  await expect
    .poll(() => page.evaluate(() => document.fonts.check('700 16px Montserrat')))
    .toBe(true);
});
