import { expect, test } from '@playwright/test';

/*
 * The web apps' menu drawer (decision 107) on a phone, on Cruising's own host (cruising.localhost):
 * the header keeps only the logo and the ☰ button, the drawer opens as a modal, closes with Escape
 * (focus back on the button) and on following a link, and marks the page it led to.
 */
test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  launchOptions: { executablePath: process.env.E2E_CHROMIUM_PATH || undefined },
});

function cruisingUrl(baseURL: string | undefined): string {
  const url = new URL(baseURL ?? 'http://localhost:3001');
  url.hostname = `cruising.${url.hostname}`;
  return url.origin;
}

test('the Cruising menu opens on a phone and navigates', async ({ page, baseURL }) => {
  const base = cruisingUrl(baseURL);
  await page.goto(`${base}/es`);

  const banner = page.getByRole('banner');
  const trigger = banner.getByRole('button', { name: 'Menú' });
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  // The header holds no links but the logo: everything else is in the drawer.
  await expect(banner.getByRole('link', { name: 'Lugares', exact: true })).toHaveCount(0);

  await trigger.click();
  const drawer = page.getByRole('dialog', { name: 'Menú' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Cerrar el menú' })).toBeFocused();
  await expect(drawer.getByRole('heading', { name: 'Descubrir' })).toBeVisible();
  // A visitor sees no members-only links.
  await expect(drawer.getByRole('link', { name: 'Mensajes', exact: true })).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(trigger).toBeFocused();

  // The rules are in the drawer's footer, with the language and the account.
  await trigger.click();
  await drawer.getByRole('link', { name: 'Normas', exact: true }).click();
  await expect(page).toHaveURL(`${base}/es/rules`);
  await expect(drawer).toBeHidden();

  await trigger.click();
  await expect(drawer.getByRole('link', { name: 'Normas', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await drawer.getByRole('button', { name: 'Cerrar el menú' }).click();
  await expect(drawer).toBeHidden();
});
