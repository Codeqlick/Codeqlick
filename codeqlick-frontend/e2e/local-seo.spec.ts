import { expect, test } from '@playwright/test';

// Local service pages (architecture 6.2, decision 121).
test.describe('local service pages', () => {
  test('a city page renders its FAQ, hreflang and links', async ({ page }) => {
    await page.goto('/es/services/web-design/valencia');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Diseño web en Valencia desde 200 €',
    );
    await expect(page).toHaveTitle('Diseño web en Valencia desde 200 € — Codeqlick');

    // The city's question, answered honestly, opens and closes with no script needed.
    const answer = page.getByText(/^No\. Codeqlick trabaja en remoto con negocios de toda España/);
    await expect(answer).toBeHidden();
    await page.getByText('¿Tenéis oficina en Valencia?').click();
    await expect(answer).toBeVisible();

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      /\/es\/services\/web-design\/valencia$/,
    );
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
      'href',
      /\/en\/services\/web-design\/valencia$/,
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      /\/es\/services\/web-design\/valencia\/og$/,
    );
    const structured = (await page.locator('script[type="application/ld+json"]').allTextContents())
      .map((text) => JSON.parse(text) as { '@type': string })
      .map((data) => data['@type']);
    expect(structured).toEqual(expect.arrayContaining(['Service', 'BreadcrumbList', 'FAQPage']));

    // The same service in another city.
    await page.getByRole('link', { name: 'Bilbao', exact: true }).click();
    await expect(page).toHaveURL(/\/es\/services\/web-design\/bilbao$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Diseño web en Bilbao desde 200 €',
    );
  });

  test('the hub lists its cities and unknown cities are a 404', async ({ page }) => {
    await page.goto('/en/services/custom-software');
    await page.getByRole('link', { name: 'Seville', exact: true }).click();
    await expect(page).toHaveURL(/\/en\/services\/custom-software\/sevilla$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Custom software in Seville');

    const response = await page.goto('/en/services/custom-software/paris');
    expect(response?.status()).toBe(404);
  });
});
