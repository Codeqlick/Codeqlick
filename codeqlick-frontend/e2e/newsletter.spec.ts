import { expect, test } from '@playwright/test';
import { runTag } from './helpers';

test.describe('newsletter', () => {
  test('the blog ends with a sign-up box that asks for confirmation by email', async ({ page }) => {
    const tag = runTag();
    await page.goto('/es/blog');
    const box = page.getByRole('region', { name: 'Recibe los nuevos artículos por correo' });
    await expect(box).toBeVisible();

    // Forms sent less than 3 s after the page was served are taken for bots.
    await page.waitForTimeout(3200);
    await box.getByRole('button', { name: 'Suscribirme' }).click();
    await expect(box.getByText('Tienes que aceptar la política de privacidad.')).toBeVisible();

    await box.getByLabel('Tu correo electrónico').fill(`e2e-newsletter-${tag}@codeqlick.test`);
    await box.locator('input[name=acceptPrivacy]').check();
    await box.getByRole('button', { name: 'Suscribirme' }).click();
    await expect(box.getByText('Revisa tu bandeja de entrada para confirmar.')).toBeVisible();
  });

  test('the unsubscribe page shows a button and does nothing until it is pressed', async ({
    page,
  }) => {
    await page.goto('/es/newsletter/unsubscribe?token=e2e-unknown-token');
    await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', /noindex/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Darte de baja del boletín');
    const button = page.getByRole('button', { name: 'Darme de baja' });
    await expect(button).toBeVisible();

    // An unknown link is refused only when the button is pressed.
    await button.click();
    await expect(page.getByText('Este enlace no es válido.', { exact: false })).toBeVisible();
  });

  test('the confirmation page tells an invalid link apart and offers to sign up again', async ({
    page,
  }) => {
    await page.goto('/es/newsletter/confirm?token=e2e-unknown-token');
    await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', /noindex/);
    // Opening the link confirms nothing: the button does, and an unknown token is refused then.
    await page.getByRole('button', { name: 'Confirmar mi suscripción' }).click();
    await expect(page.getByText('Este enlace no es válido o ha caducado.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Suscribirme' })).toBeVisible();
  });
});
