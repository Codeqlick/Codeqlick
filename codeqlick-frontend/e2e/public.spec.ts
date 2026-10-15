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

  test('blog list and an unknown page', async ({ page }) => {
    await page.goto('/es/blog');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const response = await page.goto('/es/does-not-exist');
    expect(response?.status()).toBe(404);
  });
});
