import { expect, test } from '@playwright/test';

/**
 * Neoqlick's hosts (architecture 4.18): `neoqlick.localhost` is the portal and its subdomains the
 * apps and the account host. These checks need no API (the realm flows run against PR A's API).
 */
const port = new URL(process.env.E2E_BASE_URL ?? 'http://localhost:3001').port || '3000';
const host = (name = '') => `http://${name ? `${name}.` : ''}neoqlick.localhost:${port}`;

test('the portal presents the three apps with the kit’s content and no Codeqlick', async ({
  page,
}) => {
  await page.goto(`${host()}/es`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Conecta a tu manera.');
  await expect(page.locator('html')).toHaveAttribute('data-brand', 'neoqlick');
  for (const app of ['Cruising', 'Swipe', 'Videochat']) {
    await expect(page.getByRole('link', { name: `Abrir ${app}` })).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: /Primero, tú\./ })).toBeVisible();
  expect(await page.content()).not.toMatch(/codeqlick/i);
});

test('the portal’s card opens the app on its own host', async ({ page }) => {
  await page.goto(`${host()}/en`);
  await page.getByRole('link', { name: 'Open Cruising' }).click();
  await expect(page).toHaveURL(new RegExp(`cruising\\.neoqlick\\.localhost:${port}/en`));
  expect(await page.content()).not.toMatch(/codeqlick/i);
});

test('sign-in on an app goes to the Neoqlick account host and its sign-up asks for the terms', async ({
  page,
}) => {
  await page.goto(`${host('swipe')}/en/login`);
  await expect(page).toHaveURL(
    new RegExp(`account\\.neoqlick\\.localhost:${port}/en/authorize|login`),
  );
  await page.goto(`${host('account')}/en/register`);
  await expect(page.getByLabel('I am 18 years old or older')).toBeVisible();
  await expect(page.getByRole('link', { name: 'terms of use' })).toHaveAttribute(
    'href',
    new RegExp(`neoqlick\\.localhost:${port}/en/terms`),
  );
});

test('an unknown Neoqlick host is not served and the portal 404 keeps the brand', async ({
  page,
}) => {
  const unknown = await page.goto(`${host('nothing')}/en`);
  expect(unknown?.status()).toBe(404);
  await page.goto(`${host()}/en/nope`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await page.content()).not.toMatch(/codeqlick/i);
});
