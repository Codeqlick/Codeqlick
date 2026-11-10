import { expect, test } from '@playwright/test';
import { runTag } from './helpers';

test('a visitor asks for a free website check and lands on its report', async ({ page }) => {
  const tag = runTag();
  await page.goto('/es/website-check');
  // Forms sent less than 2 s after the page was served are taken for bots.
  await page.waitForTimeout(2200);
  await page.getByRole('button', { name: 'Revisar mi web' }).click();
  await expect(page.getByText('Tienes que aceptar la política de privacidad.')).toBeVisible();

  // A .test domain never resolves: the check stays pending (tests) or fails, never reaches out.
  const host = `e2e-${tag}.codeqlick.test`;
  await page.getByLabel('Dirección de tu web').fill(host);
  await page.getByLabel('Tu correo electrónico').fill(`e2e-check-${tag}@codeqlick.test`);
  await page.locator('input[name=acceptPrivacy]').check();
  await page.getByRole('button', { name: 'Revisar mi web' }).click();
  await page.waitForURL(/\/es\/website-check\/[0-9a-f-]{36}$/, { waitUntil: 'commit' });
  await expect(page.getByRole('heading', { level: 1 })).toContainText(host);
});
