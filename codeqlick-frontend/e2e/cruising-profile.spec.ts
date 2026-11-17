import { expect, test, type APIRequestContext, type BrowserContext } from '@playwright/test';
import {
  accountId,
  adminHeaders,
  API_URL,
  createNeoqlickUser,
  neoqlickUrl,
  runTag,
} from './helpers';

/*
 * Cruising's profile pages (architecture 4.15, "Profile pages") on Cruising's own host
 * (cruising.neoqlick.localhost): a member with a review, a published spot and a meetup, seen by another
 * member (header, actions, the "⋯" menu, the sub-nav and its sections), then the viewer's own
 * /me (how others see them, what's missing, the sections and the older anchors).
 */
test.use({
  launchOptions: { executablePath: process.env.E2E_CHROMIUM_PATH || undefined },
});

function cruisingUrl(baseURL: string | undefined): string {
  return neoqlickUrl('cruising', baseURL);
}

type Member = { id: string; nickname: string; auth: { Authorization: string } };

/** An account that entered Cruising and has a profile, signed in through the API. */
async function cruisingMember(
  request: APIRequestContext,
  tag: string,
  name: string,
  profile: Record<string, unknown>,
): Promise<Member> {
  const email = `e2e-cruising-profile-${name}-${tag}@codeqlick.test`;
  const password = `cruising-pass-${tag}-0`;
  const accessToken = await createNeoqlickUser(request, { email, name, password });
  const id = await accountId(request, accessToken);
  const auth = { Authorization: `Bearer ${accessToken}` };
  const status = await request.get(`${API_URL}/cruising/me`, { headers: auth });
  const { termsVersion } = (await status.json()) as { termsVersion: string };
  const entered = await request.put(`${API_URL}/cruising/me`, {
    headers: auth,
    data: { birthDate: '1990-05-20', acceptTerms: true, consentSpecialData: true, termsVersion },
  });
  expect(entered.ok()).toBeTruthy();
  const nickname = `${name}_${tag}`;
  const saved = await request.patch(`${API_URL}/cruising/profile`, {
    headers: auth,
    data: { nickname, ...profile },
  });
  expect(saved.ok()).toBeTruthy();
  return { id, nickname, auth };
}

const open: BrowserContext[] = [];

test.afterAll(async () => {
  for (const context of open) await context.close();
});

test('a member profile and my profile, with their sections', async ({
  browser,
  request,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const tag = runTag();
  const base = cruisingUrl(baseURL);
  const lat = 36 + Math.random();
  const lng = -5 + Math.random();

  const host = await cruisingMember(request, tag, 'host', {
    bio: 'Long walks on the beach.',
    country: 'ES',
    lookingFor: ['CHAT', 'DATES'],
  });
  const viewer = await cruisingMember(request, tag, 'viewer', {});

  // A spot by the team, reviewed by the host, with a meetup; and a spot the host proposed.
  const teamSpot = await request.post(`${API_URL}/admin/cruising/spots`, {
    headers: adminHeaders(),
    data: {
      name: `Team cove ${tag}`,
      type: 'BEACH',
      lat,
      lng,
      countryCode: 'ES',
      city: 'Cádiz',
      description: 'A quiet cove for the profile test.',
    },
  });
  expect(teamSpot.ok()).toBeTruthy();
  const spot = (await teamSpot.json()) as { id: string };
  const proposed = await request.post(`${API_URL}/cruising/spots`, {
    headers: host.auth,
    data: {
      name: `Host park ${tag}`,
      type: 'PARK',
      lat: lat + 0.2,
      lng: lng + 0.2,
      countryCode: 'ES',
      city: 'Cádiz',
      description: 'A park the host proposed.',
    },
  });
  expect(proposed.ok()).toBeTruthy();
  const own = (await proposed.json()) as { id: string };
  const approved = await request.post(`${API_URL}/admin/cruising/spots/${own.id}/approve`, {
    headers: adminHeaders(),
  });
  expect(approved.ok()).toBeTruthy();
  const reviewed = await request.put(`${API_URL}/cruising/spots/${spot.id}/review`, {
    headers: host.auth,
    data: { rating: 5, text: 'Calm at sunset.' },
  });
  expect(reviewed.ok()).toBeTruthy();
  const meetup = await request.post(`${API_URL}/cruising/meetups`, {
    headers: host.auth,
    data: {
      spotId: spot.id,
      startsAt: new Date(Date.now() + 2 * 24 * 3600_000).toISOString(),
      hours: 2,
      title: `Sunset walk ${tag}`,
    },
  });
  expect(meetup.ok()).toBeTruthy();

  const context = await browser.newContext({ baseURL: base });
  open.push(context);
  await context.addCookies([
    {
      name: 'cq_at',
      value: viewer.auth.Authorization.slice('Bearer '.length),
      url: base,
      httpOnly: true,
    },
  ]);
  const page = await context.newPage();

  // The host's profile, as the viewer sees it.
  await page.goto(`/es/members/${host.nickname}`);
  await expect(page.getByRole('heading', { level: 1, name: host.nickname })).toBeVisible();
  await expect(page.getByText('Long walks on the beach.')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Qué busca' })).toContainText('Citas');
  await expect(page.getByRole('button', { name: 'Enviar un mensaje' })).toBeVisible();

  // Block and Report sit behind the "⋯" disclosure.
  const more = page.getByLabel('Más acciones');
  const menu = more.locator('..');
  await expect(menu.getByText('Bloquear', { exact: true })).toBeHidden();
  await more.click();
  await expect(menu.getByText('Bloquear', { exact: true })).toBeVisible();
  await expect(menu.getByText('Denunciar', { exact: true })).toBeVisible();
  await more.click();
  await expect(menu.getByText('Bloquear', { exact: true })).toBeHidden();

  const nav = page.getByRole('navigation', { name: 'Secciones del perfil' });
  for (const name of ['Fotos', 'Reseñas', 'Sitios', 'Quedadas']) {
    await expect(nav.getByRole('link', { name: new RegExp(`^${name}`) })).toBeVisible();
  }
  await nav.getByRole('link', { name: /^Reseñas/ }).click();
  await expect(page).toHaveURL(/#reviews$/);
  const reviews = page.locator('#reviews');
  await expect(reviews.getByRole('link', { name: `Team cove ${tag}` })).toBeVisible();
  await expect(reviews.getByText('Calm at sunset.')).toBeVisible();
  await expect(
    page.locator('#spots').getByRole('link', { name: `Host park ${tag}` }),
  ).toBeVisible();
  await expect(page.locator('#meetups').getByText(`Sunset walk ${tag}`)).toBeVisible();
  await expect(page.locator('#photos')).toContainText('aún no ha subido fotos');

  // A wink still works from the action bar.
  await page.getByRole('button', { name: 'Guiñar un ojo' }).click();
  await expect(page.getByText('Hoy ya le has guiñado un ojo.')).toBeVisible();

  // My own profile: how others see me, what's missing, the sections and the older anchors.
  await page.goto('/es/me');
  await expect(page.getByRole('heading', { level: 1, name: 'Mi perfil' })).toBeVisible();
  const preview = page.getByRole('region', { name: 'Cómo te ven los demás' });
  await expect(preview.getByRole('heading', { name: viewer.nickname })).toBeVisible();
  const complete = page.getByRole('region', { name: 'Perfil completado' });
  await expect(complete.getByText('1 de 6 hechos')).toBeVisible();
  await expect(complete.getByRole('link', { name: 'Una foto' })).toHaveAttribute('href', '#photos');
  const sections = page.getByRole('navigation', { name: 'Secciones del perfil' });
  for (const name of [
    'Perfil',
    'Fotos y vídeos',
    'Verificación',
    'Notificaciones',
    'Seguridad',
    'Privacidad',
  ]) {
    await expect(sections.getByRole('link', { name, exact: true })).toBeVisible();
  }
  for (const anchor of ['#timer', '#health', '#safety-contacts', '#me-favorites', '#me-media']) {
    await expect(page.locator(anchor)).toHaveCount(1);
  }

  // The name is shown as the username; another one just for Cruising is behind a disclosure.
  await expect(page.getByText(`Tu nombre de usuario: @${viewer.nickname}`)).toBeVisible();
  await expect(page.getByLabel('Nombre de usuario', { exact: true })).toBeHidden();
  await page.getByText('Usar otro nombre en Cruising').click();
  await expect(page.getByLabel('Nombre de usuario', { exact: true })).toHaveValue(viewer.nickname);

  // The profile form still saves, and the preview follows.
  await page.getByLabel('Sobre ti').fill('Here for the sunsets.');
  await page.getByRole('button', { name: 'Guardar', exact: true }).first().click();
  await expect(page.getByText('Guardado.').first()).toBeVisible();
  await page.reload();
  await expect(preview.getByText('Here for the sunsets.')).toBeVisible();
  await expect(complete.getByText('2 de 6 hechos')).toBeVisible();
});
