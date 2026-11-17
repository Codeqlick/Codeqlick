import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { adminHeaders, API_URL, apiLogin, runTag } from './helpers';

/*
 * Cruising's onboarding tour (decision 102) on the map, on Cruising's own host (cruising.localhost):
 * a compact panel over the map that leaves the map in view on a desktop and on a phone, one primary
 * action per step ("Guardar y seguir" saves the nickname and moves on), folds down to its header,
 * and "Saltar" ends it for good.
 */
test.use({ launchOptions: { executablePath: process.env.E2E_CHROMIUM_PATH || undefined } });

function cruisingUrl(baseURL: string | undefined): string {
  const url = new URL(baseURL ?? 'http://localhost:3001');
  url.hostname = `cruising.${url.hostname}`;
  return url.origin;
}

/** A new account that has entered Cruising (age and terms) but not done the tour; its token. */
async function newMember(request: APIRequestContext): Promise<string> {
  const tag = runTag();
  const member = { email: `e2e-tour-${tag}@codeqlick.test`, password: `tour-pass-${tag}-0` };
  const created = await request.post(`${API_URL}/admin/users`, {
    headers: adminHeaders(),
    data: { ...member, name: `Tour ${tag}`, role: 'CLIENT', locale: 'es' },
  });
  expect(created.ok()).toBeTruthy();
  const token = await apiLogin(request, member);
  const headers = { Authorization: `Bearer ${token}` };
  const status = await request.get(`${API_URL}/cruising/me`, { headers });
  const { termsVersion } = (await status.json()) as { termsVersion: string };
  const entered = await request.put(`${API_URL}/cruising/me`, {
    headers,
    data: { birthDate: '1990-01-01', acceptTerms: true, consentSpecialData: true, termsVersion },
  });
  expect(entered.ok()).toBeTruthy();
  return token;
}

/** The map's top is above the fold and the tour doesn't cover the map's top part. */
async function expectMapInView(page: Page) {
  const viewport = page.viewportSize()!;
  const map = await page.getByRole('region', { name: 'Mapa de lugares de cruising' }).boundingBox();
  const tour = await page
    .getByRole('region', { name: 'Te damos la bienvenida a Cruising' })
    .boundingBox();
  expect(map && tour).toBeTruthy();
  expect(map!.y).toBeLessThan(viewport.height / 2);
  // At least a quarter of the screen's height of map shows above the tour.
  expect(tour!.y - map!.y).toBeGreaterThan(viewport.height / 4);
}

test('the tour floats over the map and leaves it in view (desktop and phone)', async ({
  browser,
  request,
  baseURL,
}) => {
  const base = cruisingUrl(baseURL);
  const token = await newMember(request);

  for (const device of [
    { viewport: { width: 1440, height: 900 } },
    { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  ]) {
    const context = await browser.newContext(device);
    await context.addCookies([{ name: 'cq_at', value: token, url: base, httpOnly: true }]);
    const page = await context.newPage();
    await page.goto(`${base}/es/map`);
    const tour = page.getByRole('region', { name: 'Te damos la bienvenida a Cruising' });
    await expect(tour).toBeVisible();
    await expect(tour.getByText('1/4')).toBeVisible();
    await expectMapInView(page);
    // No page-wide sideways scrolling on the phone.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      device.viewport.width,
    );
    await context.close();
  }
});

test('one action per step, foldable, and "Saltar" ends it', async ({
  browser,
  request,
  baseURL,
}) => {
  const base = cruisingUrl(baseURL);
  const token = await newMember(request);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies([{ name: 'cq_at', value: token, url: base, httpOnly: true }]);
  const page = await context.newPage();
  await page.goto(`${base}/es/map`);
  const tour = page.getByRole('region', { name: 'Te damos la bienvenida a Cruising' });

  // Step 1: the nickname form has no button of its own; "Guardar y seguir" saves and moves on.
  await expect(tour.getByRole('heading', { name: 'Elige un nombre de usuario' })).toBeVisible();
  await expect(tour.getByRole('button', { name: 'Siguiente' })).toHaveCount(0);
  await tour.getByLabel('Nombre de usuario').fill(`tour_${runTag()}`);
  await tour.getByRole('button', { name: 'Guardar y seguir' }).click();
  const favourites = tour.getByRole('heading', { name: 'Guarda tus sitios favoritos' });
  await expect(favourites).toBeFocused();
  await expect(tour.getByText('2/4')).toBeVisible();

  // Folded down to its header and back.
  const fold = tour.getByRole('button', { name: 'Pasos del recorrido' });
  await fold.click();
  await expect(fold).toHaveAttribute('aria-expanded', 'false');
  await expect(favourites).toBeHidden();
  await fold.click();
  await expect(favourites).toBeVisible();

  // Steps without a form: "Siguiente" and "Atrás".
  await tour.getByRole('button', { name: 'Siguiente' }).click();
  await expect(tour.getByRole('heading', { name: 'Activa las notificaciones' })).toBeFocused();
  await tour.getByRole('button', { name: 'Atrás' }).click();
  await expect(favourites).toBeFocused();

  await tour.getByRole('button', { name: 'Saltar' }).click();
  await expect(tour).toBeHidden();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Mapa de lugares de cruising' })).toBeVisible();
  await expect(tour).toHaveCount(0);
  await context.close();
});
