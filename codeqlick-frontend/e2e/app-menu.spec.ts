import { expect, test } from '@playwright/test';
import { asAdmin } from './helpers';

/*
 * The web apps' menu drawer (decision 107) on a phone, on Cruising's own host (cruising.localhost):
 * the header keeps only the logo and the ☰ button, the drawer opens as a modal, closes with Escape
 * (focus back on the button) and on following a link, and marks the page it led to. The user card
 * at the top offers signing in and up to a visitor, and the profile and the account once signed in.
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
  // The card at the top: signing in and up, once (the footer no longer repeats it).
  const card = drawer.getByRole('region', { name: 'Tu cuenta' });
  await expect(card.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute(
    'href',
    /\/login\?next=/,
  );
  await expect(card.getByRole('link', { name: 'Crear cuenta' })).toBeVisible();
  await expect(drawer.getByRole('link', { name: 'Iniciar sesión' })).toHaveCount(1);

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

test('signed in, the Cruising menu shows the avatar and the user card', async ({
  page,
  context,
  baseURL,
}) => {
  const base = cruisingUrl(baseURL);
  await asAdmin(context, base);
  await page.goto(`${base}/es`);

  const trigger = page.getByRole('banner').getByRole('button', { name: /^Menú — / });
  await expect(trigger).toBeVisible();
  await trigger.click();
  const drawer = page.getByRole('dialog', { name: 'Menú' });
  const card = drawer.getByRole('region', { name: 'Tu cuenta' });
  // Before entering Cruising the button leads to the entry step; after, to the profile.
  const profile = card.getByRole('link', { name: /^(Mi perfil|Completa tu perfil)$/ });
  await expect(profile).toHaveAttribute('href', /\/me$/);
  await expect(card.getByRole('link', { name: 'Mi cuenta' })).toHaveAttribute(
    'href',
    /\/(admin|portal)\/account$|^https?:\/\/account\./,
  );
  await expect(drawer.getByRole('link', { name: 'Iniciar sesión' })).toHaveCount(0);
  // The profile is on the card, no longer in the list.
  await expect(drawer.getByRole('link', { name: 'Perfil', exact: true })).toHaveCount(0);
  await profile.click();
  await expect(page).toHaveURL(`${base}/es/me`);
});
