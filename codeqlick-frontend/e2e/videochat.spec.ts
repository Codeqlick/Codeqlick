import { expect, test, type Browser, type Page } from '@playwright/test';
import { adminHeaders, API_URL, asAdmin, runTag, signIn } from './helpers';

/*
 * The video chat on its own host (videochat.localhost: browsers send *.localhost to this machine)
 * with two real browsers and a fake camera: sign in there, confirm 18+, set a nickname, get
 * paired, see each other's video, chat, and move on with Esc.
 */
test.use({
  launchOptions: {
    // Another Chromium than Playwright's own, when given (e.g. a sandbox with one preinstalled).
    executablePath: process.env.E2E_CHROMIUM_PATH || undefined,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  },
});

function videochatUrl(baseURL: string | undefined): string {
  const url = new URL(baseURL ?? 'http://localhost:3001');
  url.hostname = `videochat.${url.hostname}`;
  return url.origin;
}

async function person(browser: Browser, base: string, user: { email: string; password: string }) {
  const context = await browser.newContext({
    baseURL: base,
    permissions: ['camera', 'microphone'],
  });
  const page = await context.newPage();
  await signIn(page, user, '/es/videochat/room');
  await expect(page).toHaveURL(`${base}/es/videochat/room`);
  await page.getByLabel('Fecha de nacimiento').fill('1994-03-15');
  await page.getByLabel(/Tengo 18 años o más/).check();
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('button', { name: 'Activar cámara y empezar' })).toBeVisible();
  return page;
}

/** In a call: the partner's video plays and the chat is open. */
async function inCall(page: Page) {
  await expect(page.getByPlaceholder('Escribe un mensaje…')).toBeEnabled({ timeout: 20_000 });
  await expect
    .poll(() =>
      page
        .locator('video')
        .first()
        .evaluate((video: HTMLVideoElement) => video.videoWidth),
    )
    .toBeGreaterThan(0);
}

test('two people meet in the video chat, talk and move on', async ({
  browser,
  request,
  baseURL,
}) => {
  const tag = runTag();
  const base = videochatUrl(baseURL);
  const users = ['ana', 'ben'].map((name) => ({
    name,
    email: `e2e-vc-${name}-${tag}@codeqlick.test`,
    password: `videochat-pass-${tag}-0`,
  }));
  const ids: string[] = [];
  for (const user of users) {
    const response = await request.post(`${API_URL}/admin/users`, {
      headers: adminHeaders(),
      data: {
        email: user.email,
        name: user.name,
        role: 'CLIENT',
        password: user.password,
        locale: 'es',
      },
    });
    expect(response.ok()).toBeTruthy();
    ids.push(((await response.json()) as { id: string }).id);
  }

  try {
    const [ana, ben] = [
      await person(browser, base, users[0]!),
      await person(browser, base, users[1]!),
    ];

    // Ana picks a nickname: that, not her name, is what Ben sees.
    await ana.goto('/es/videochat/settings');
    await ana.getByLabel('Apodo').fill(`Ana ${tag}`);
    await ana.getByRole('combobox', { name: 'Género' }).selectOption('WOMAN');
    await ana.getByRole('combobox', { name: 'País' }).selectOption('ES');
    await ana.getByRole('combobox', { name: 'Idioma' }).selectOption('es');
    await ana.getByLabel('Música').check();
    await ana.getByLabel('Viajar').check();
    await ana.getByLabel('Charla picante').check();
    // The selects keep what was saved after each save (the form reset used to blank them) and
    // after a reload.
    for (let save = 0; save < 2; save++) {
      await ana.getByRole('button', { name: 'Guardar' }).click();
      await ana.waitForLoadState('networkidle');
      await expect(ana.getByText('Guardado.', { exact: false })).toBeVisible();
      await expect(ana.getByRole('combobox', { name: 'Género' })).toHaveValue('WOMAN');
      await expect(ana.getByRole('combobox', { name: 'País' })).toHaveValue('ES');
      await expect(ana.getByRole('combobox', { name: 'Idioma' })).toHaveValue('es');
    }
    await ana.reload();
    await expect(ana.getByRole('combobox', { name: 'Género' })).toHaveValue('WOMAN');
    await expect(ana.getByRole('combobox', { name: 'País' })).toHaveValue('ES');
    await ana.goto('/es/videochat/room');

    await ana.getByRole('button', { name: 'Activar cámara y empezar' }).click();
    await expect(ana.getByText('Buscando a alguien…')).toBeVisible();
    await ben.getByRole('button', { name: 'Activar cámara y empezar' }).click();
    await inCall(ana);
    await inCall(ben);
    await expect(ben.getByText(`Ana ${tag}`)).toBeVisible();
    // Ben sees the interests Ana picked.
    await expect(ben.getByRole('list', { name: 'Sus intereses' })).toContainText('Música');
    await expect(ben.getByRole('list', { name: 'Sus intereses' })).toContainText('Viajar');
    await expect(ben.getByRole('list', { name: 'Sus intereses' })).toContainText('Charla picante');

    await ana.getByPlaceholder('Escribe un mensaje…').fill('¡Hola!');
    await ana.getByRole('button', { name: 'Enviar' }).click();
    await expect(ben.getByText('¡Hola!')).toBeVisible();

    // Esc is "next": Ana is told and both look for someone else.
    await ben.keyboard.press('Escape');
    await expect(ana.getByText('La otra persona se ha ido. Buscando a otra…')).toBeVisible();
    // They just talked, so they can't meet again for a minute: Ana is told why she waits.
    await expect(ana.getByText('Hay 1 persona más esperando', { exact: false })).toBeVisible();
  } finally {
    for (const id of ids) {
      await request.delete(`${API_URL}/admin/users/${id}`, { headers: adminHeaders() });
    }
  }
});

test('two people who like each other become contacts and call each other', async ({
  browser,
  request,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const tag = runTag();
  const base = videochatUrl(baseURL);
  const users = ['cai', 'dan'].map((name) => ({
    name,
    email: `e2e-vc-${name}-${tag}@codeqlick.test`,
    password: `videochat-pass-${tag}-0`,
  }));
  const ids: string[] = [];
  for (const user of users) {
    const response = await request.post(`${API_URL}/admin/users`, {
      headers: adminHeaders(),
      data: {
        email: user.email,
        name: user.name,
        role: 'CLIENT',
        password: user.password,
        locale: 'es',
      },
    });
    expect(response.ok()).toBeTruthy();
    ids.push(((await response.json()) as { id: string }).id);
  }

  try {
    const [cai, dan] = [
      await person(browser, base, users[0]!),
      await person(browser, base, users[1]!),
    ];
    await dan.goto('/es/videochat/settings');
    await dan.getByLabel('Apodo').fill(`Dan ${tag}`);
    await dan.getByRole('button', { name: 'Guardar' }).click();
    await expect(dan.getByText('Guardado.', { exact: false })).toBeVisible();
    await dan.goto('/es/videochat/room');

    await cai.getByRole('button', { name: 'Activar cámara y empezar' }).click();
    await dan.getByRole('button', { name: 'Activar cámara y empezar' }).click();
    await inCall(cai);
    await inCall(dan);

    // Both press "Like": they are contacts now, and both are told.
    await cai.getByRole('button', { name: /Me gusta/ }).click();
    await expect(
      cai.getByText('Si también te lo da, seréis contactos', { exact: false }),
    ).toBeVisible();
    await dan.getByRole('button', { name: /Me gusta/ }).click();
    await expect(cai.getByText(`¡Os gustáis! Dan ${tag} y tú ya sois contactos.`)).toBeVisible();
    await expect(dan.getByText('¡Os gustáis! Ya sois contactos.')).toBeVisible();

    // Dan stops; Cai sees him on her contacts, free, and calls him.
    await dan.getByRole('button', { name: 'Parar' }).click();
    await cai.getByRole('button', { name: 'Parar' }).click();
    await cai.goto('/es/videochat/contacts');
    await expect(cai.getByText(`Dan ${tag}`)).toBeVisible();
    await expect(cai.getByText(/^En el videochat · Contactos desde/)).toBeVisible();
    await cai.getByRole('link', { name: 'Llamar' }).click();
    await cai.getByRole('button', { name: 'Activar cámara y empezar' }).click();
    await expect(cai.getByText(`Llamando a Dan ${tag}…`)).toBeVisible();
    await expect(dan.getByText('Un contacto te está llamando')).toBeVisible();
    await dan.getByRole('button', { name: 'Aceptar' }).click();
    await inCall(cai);
    await inCall(dan);

    // Full screen and back.
    await cai.getByRole('button', { name: 'Pantalla completa' }).click();
    await cai.getByRole('button', { name: 'Salir de pantalla completa' }).click();
    await expect(cai.getByRole('button', { name: 'Pantalla completa' })).toBeVisible();
  } finally {
    for (const id of ids) {
      await request.delete(`${API_URL}/admin/users/${id}`, { headers: adminHeaders() });
    }
  }
});

test('the video chat installs as its own app', async ({ page, baseURL }) => {
  // Through the browser: it, unlike Node, sends *.localhost to this machine.
  const base = videochatUrl(baseURL);
  const manifest = await page.goto(`${base}/manifest.webmanifest`);
  expect(manifest?.ok()).toBe(true);
  expect(await manifest?.json()).toMatchObject({
    id: '/videochat',
    name: 'Codeqlick Videochat',
    start_url: '/',
    display: 'standalone',
  });
  const worker = await page.goto(`${base}/videochat-sw.js`);
  expect(worker?.ok()).toBe(true);
  expect(await worker?.text()).toContain("addEventListener('push'");

  // The studio's own site keeps its own manifest.
  const studio = await page.goto(`${baseURL ?? 'http://localhost:3001'}/manifest.webmanifest`);
  const studioManifest = (await studio?.json()) as { name?: string } | undefined;
  expect(studioManifest?.name).not.toBe('Codeqlick Videochat');
});

test('the team sees the video chat statistics', async ({ page, context, baseURL }) => {
  await asAdmin(context, baseURL ?? '');
  await page.goto('/es/admin/videochat');
  await page.getByRole('link', { name: 'Ver estadísticas' }).click();
  await expect(page.getByRole('heading', { name: 'Estadísticas del videochat' })).toBeVisible();
  await expect(page.getByText('Personas que lo usaron')).toBeVisible();
  await expect(page.getByRole('table', { name: 'Llamadas por día' })).toHaveCount(1);
  await page
    .getByRole('navigation', { name: 'Periodo' })
    .getByRole('link', { name: '7 días' })
    .click();
  await expect(page).toHaveURL(/days=7/);
  // One row per day in the chart's table.
  await expect(
    page.getByRole('table', { name: 'Personas por día' }).locator('tbody tr'),
  ).toHaveCount(7);
});
