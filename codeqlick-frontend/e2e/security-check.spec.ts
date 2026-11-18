import { expect, test } from '@playwright/test';
import { asAdmin, runTag } from './helpers';

/*
 * The free Security check (architecture 4.19). The API refuses IPs, localhost and reserved names
 * (.test, .local…), so a made-up name under a real domain is used: it has no DNS records, so the
 * check ends FAILED ("doesn't exist") without touching anyone's server. The report page may also
 * still be PENDING when the test looks: any of the three states is a valid report page.
 */
test.use({
  launchOptions: { executablePath: process.env.E2E_CHROMIUM_PATH || undefined },
});

test('the form validates, then a visitor lands on the report of their check, which the team sees', async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const tag = runTag();
  const host = `e2e-${tag}.codeqlick.com`;

  await page.goto('/es/security-check');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Security check');
  // Forms sent less than 2 s after the page was served are taken for bots.
  await page.waitForTimeout(2200);
  await page.getByRole('button', { name: 'Revisar mi dominio' }).click();
  await expect(page.getByText('Tienes que aceptar la política de privacidad.')).toBeVisible();

  await page.getByLabel('Tu dominio').fill('localhost');
  await page.getByLabel('Tu correo electrónico').fill(`e2e-sec-${tag}@codeqlick.test`);
  await page.locator('input[name=acceptPrivacy]').check();
  await page.getByRole('button', { name: 'Revisar mi dominio' }).click();
  await expect(page.getByText('Escribe un dominio', { exact: false })).toBeVisible();

  await page.getByLabel('Tu dominio').fill(host);
  await page.getByLabel('Tu correo electrónico').fill(`e2e-sec-${tag}@codeqlick.test`);
  await page.locator('input[name=acceptPrivacy]').check();
  await page.getByRole('button', { name: 'Revisar mi dominio' }).click();
  await page.waitForURL(/\/es\/security-check\/[0-9a-f-]{36}$/, { waitUntil: 'commit' });
  const reportUrl = page.url();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(host);
  // The report never shows up in search results.
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', /noindex/);
  // Pending (spinner) or already failed, never an error page.
  await expect(page.getByText('Algo ha fallado por nuestra parte.')).toBeHidden();

  // The team's list shows it, with a link to its report.
  await asAdmin(context, baseURL!);
  await page.goto('/es/admin/security-checks');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Security checks');
  const row = page.getByRole('row').filter({ hasText: host });
  await expect(row).toBeVisible();
  await expect(row.getByRole('link', { name: 'Informe' })).toHaveAttribute(
    'href',
    new URL(reportUrl).pathname,
  );
});

test('the report of an unknown check is a 404 and the English form is in English', async ({
  page,
}) => {
  const response = await page.goto('/es/security-check/00000000-0000-4000-8000-000000000000');
  expect(response?.status()).toBe(404);
  await page.goto('/en/security-check');
  await expect(page.getByRole('button', { name: 'Check my domain' })).toBeVisible();
});
