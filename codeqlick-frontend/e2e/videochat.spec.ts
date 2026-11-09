import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { adminHeaders, API_URL, asAdmin, runTag, signIn } from './helpers';
import { testPng } from './images';

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

/** The people's browsers of the running test, closed before their accounts are deleted. */
const open: BrowserContext[] = [];

/**
 * Closes the people's browsers. Left open, they would stay in the queue after their accounts are
 * gone, and the next test's people would be paired with them.
 */
async function leave() {
  await Promise.all(open.splice(0).map((context) => context.close()));
}

async function person(browser: Browser, base: string, user: { email: string; password: string }) {
  const context = await browser.newContext({
    baseURL: base,
    permissions: ['camera', 'microphone'],
  });
  open.push(context);
  const page = await context.newPage();
  await signIn(page, user, '/es/videochat/room');
  await expect(page).toHaveURL(`${base}/es/room`);
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
    await ana.goto('/es/settings');
    await ana.getByLabel('Nombre de usuario').fill(`ana_${tag}`);
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
    await ana.goto('/es/room');

    await ana.getByRole('button', { name: 'Activar cámara y empezar' }).click();
    await expect(ana.getByText('Buscando a alguien…')).toBeVisible();
    await ben.getByRole('button', { name: 'Activar cámara y empezar' }).click();
    await inCall(ana);
    await inCall(ben);
    await expect(ben.getByText(`ana_${tag}`)).toBeVisible();
    // Ben sees the interests Ana picked.
    await expect(ben.getByRole('list', { name: 'Sus intereses' })).toContainText('Música');
    await expect(ben.getByRole('list', { name: 'Sus intereses' })).toContainText('Viajar');
    await expect(ben.getByRole('list', { name: 'Sus intereses' })).toContainText('Charla picante');

    await ana.getByPlaceholder('Escribe un mensaje…').fill('¡Hola!');
    // Ben sees she is typing until the message arrives.
    await expect(ben.getByText('Escribiendo…')).toBeVisible();
    await ana.getByRole('button', { name: 'Enviar' }).click();
    await expect(ben.getByText('¡Hola!')).toBeVisible();
    await expect(ben.getByText('Escribiendo…')).toBeHidden();
    // A quick reaction lands in Ana's chat.
    await ben.getByRole('button', { name: 'Reaccionar con 🔥' }).click();
    await expect(ana.getByText('Otra persona🔥')).toBeVisible();

    // Esc is "next": Ana is told and both look for someone else.
    await ben.keyboard.press('Escape');
    await expect(ana.getByText('La otra persona se ha ido. Buscando a otra…')).toBeVisible();
    // They just talked, so they can't meet again for a minute: Ana is told why she waits.
    await expect(ana.getByText('Hay 1 persona más esperando', { exact: false })).toBeVisible();
  } finally {
    await leave();
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
    await dan.goto('/es/settings');
    await dan.getByLabel('Nombre de usuario').fill(`dan_${tag}`);
    await dan.getByRole('button', { name: 'Guardar' }).click();
    await expect(dan.getByText('Guardado.', { exact: false })).toBeVisible();
    await dan.goto('/es/room');

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
    await expect(cai.getByText(`¡Os gustáis! dan_${tag} y tú ya sois contactos.`)).toBeVisible();
    await expect(dan.getByText('¡Os gustáis! Ya sois contactos.')).toBeVisible();

    // Dan stops; Cai sees him on her contacts, free, and calls him.
    await dan.getByRole('button', { name: 'Parar' }).click();
    await cai.getByRole('button', { name: 'Parar' }).click();
    await cai.goto('/es/contacts');
    await expect(cai.getByText(`dan_${tag}`)).toBeVisible();
    await expect(cai.getByText(/^En el videochat · Contactos desde/)).toBeVisible();
    await cai.getByRole('link', { name: 'Llamar' }).click();
    await cai.getByRole('button', { name: 'Activar cámara y empezar' }).click();
    await expect(cai.getByText(`Llamando a dan_${tag}…`)).toBeVisible();
    await expect(dan.getByText('Un contacto te está llamando')).toBeVisible();
    await dan.getByRole('button', { name: 'Aceptar' }).click();
    await inCall(cai);
    await inCall(dan);

    // Full screen and back.
    await cai.getByRole('button', { name: 'Pantalla completa' }).click();
    await cai.getByRole('button', { name: 'Salir de pantalla completa' }).click();
    await expect(cai.getByRole('button', { name: 'Pantalla completa' })).toBeVisible();
  } finally {
    await leave();
    for (const id of ids) {
      await request.delete(`${API_URL}/admin/users/${id}`, { headers: adminHeaders() });
    }
  }
});

test('three contacts meet in a group call', async ({ browser, request, baseURL }) => {
  test.setTimeout(180_000);
  const tag = runTag();
  const base = videochatUrl(baseURL);
  const users = ['eva', 'fay', 'gus'].map((name) => ({
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

  /** Remote videos playing in a group call (own camera not counted). */
  const remoteVideos = (page: Page) =>
    page
      .locator('video:not([muted])')
      .evaluateAll(
        (videos: HTMLVideoElement[]) =>
          videos.filter((video) => !video.muted && video.videoWidth > 0).length,
      );

  try {
    const [eva, fay, gus] = [
      await person(browser, base, users[0]!),
      await person(browser, base, users[1]!),
      await person(browser, base, users[2]!),
    ];
    for (const [page, name] of [
      [fay, 'Fay'],
      [gus, 'Gus'],
    ] as const) {
      await page.goto('/es/settings');
      await page.getByLabel('Nombre de usuario').fill(`${name.toLowerCase()}_${tag}`);
      await page.getByRole('button', { name: 'Guardar' }).click();
      await expect(page.getByText('Guardado.', { exact: false })).toBeVisible();
      await page.goto('/es/room');
    }

    // Eva becomes a contact of Fay, then of Gus.
    await eva.getByRole('button', { name: 'Activar cámara y empezar' }).click();
    for (const other of [fay, gus]) {
      await other.getByRole('button', { name: 'Activar cámara y empezar' }).click();
      await inCall(eva);
      await inCall(other);
      await eva.getByRole('button', { name: /Me gusta/ }).click();
      await other.getByRole('button', { name: /Me gusta/ }).click();
      await expect(other.getByText('¡Os gustáis! Ya sois contactos.')).toBeVisible();
      await other.getByRole('button', { name: 'Parar' }).click();
    }
    await eva.getByRole('button', { name: 'Parar' }).click();
    // The room says how many people are online.
    await expect(eva.getByText('3 personas conectadas')).toBeVisible();

    // From her contacts, Eva starts a group with Fay, who joins.
    await eva.goto('/es/contacts');
    await eva
      .getByRole('listitem')
      .filter({ hasText: `fay_${tag}` })
      .getByRole('link', { name: 'Grupo' })
      .click();
    await eva.getByRole('button', { name: 'Activar cámara y empezar' }).click();
    await expect(eva.getByText('Llamada de grupo · 1 de 4')).toBeVisible();
    await expect(fay.getByText('te invita a una llamada de grupo')).toBeVisible();
    await fay.getByRole('button', { name: 'Unirme' }).click();
    await expect(eva.getByText('Llamada de grupo · 2 de 4')).toBeVisible();

    // Eva invites Gus from inside the group.
    await eva.getByRole('button', { name: 'Invitar', exact: true }).first().click();
    const row = eva.getByRole('listitem').filter({ hasText: `gus_${tag}` });
    await row.getByRole('button', { name: 'Invitar' }).click();
    await gus.getByRole('button', { name: 'Unirme' }).click();
    for (const page of [eva, fay, gus]) {
      await expect(page.getByText('Llamada de grupo · 3 de 4')).toBeVisible();
      // Everyone sees the other two (a mesh: each browser to each).
      await expect.poll(() => remoteVideos(page), { timeout: 20_000 }).toBe(2);
    }

    // The group chat reaches everyone, with who wrote it.
    await gus.getByPlaceholder('Escribe un mensaje…').fill('¡Hola, grupo!');
    await gus.getByRole('button', { name: 'Enviar' }).click();
    await expect(eva.getByText(`gus_${tag}¡Hola, grupo!`)).toBeVisible();
    await expect(fay.getByText(`gus_${tag}¡Hola, grupo!`)).toBeVisible();

    // Gus leaves: the others stay, two of them.
    await gus.getByRole('button', { name: 'Salir del grupo' }).click();
    await expect(gus.getByText('Has salido del grupo.')).toBeVisible();
    await expect(eva.getByText('Llamada de grupo · 2 de 4')).toBeVisible();
    await expect.poll(() => remoteVideos(eva)).toBe(1);
  } finally {
    await leave();
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

test('a person gets the verified badge from a photo the team approves', async ({
  browser,
  request,
  baseURL,
}) => {
  const tag = runTag();
  const base = videochatUrl(baseURL);
  const user = {
    email: `e2e-vc-kim-${tag}@codeqlick.test`,
    password: `videochat-pass-${tag}-9`,
  };
  const created = await request.post(`${API_URL}/admin/users`, {
    headers: adminHeaders(),
    data: { email: user.email, name: 'Kim', role: 'CLIENT', password: user.password, locale: 'es' },
  });
  expect(created.ok()).toBeTruthy();
  const id = ((await created.json()) as { id: string }).id;

  try {
    const kim = await person(browser, base, user);
    await kim.goto('/es/settings');
    // Her week is there from the start (nothing yet).
    await expect(kim.getByRole('heading', { name: 'Tu semana' })).toBeVisible();
    await expect(kim.getByText('Primero elige tu apodo arriba y guárdalo.')).toBeVisible();
    await kim.getByLabel('Nombre de usuario').fill(`kim_${tag}`);
    await kim.getByRole('button', { name: 'Guardar' }).click();
    await expect(kim.getByText('Guardado.', { exact: false })).toBeVisible();
    await kim.reload();
    await kim.getByLabel('Elige la foto').setInputFiles({
      name: 'me.png',
      mimeType: 'image/png',
      buffer: testPng(21),
    });
    await kim.getByLabel(/Soy yo y la envío/).check();
    await kim.getByRole('button', { name: 'Enviar para revisar' }).click();
    await expect(kim.getByText('Estamos revisando tu foto.')).toBeVisible({ timeout: 20_000 });

    // The team approves it from the moderation page (main host).
    const adminContext = await browser.newContext({ baseURL });
    open.push(adminContext);
    await asAdmin(adminContext, baseURL!);
    const admin = await adminContext.newPage();
    await admin.goto('/es/admin/videochat');
    const item = admin.locator('article').filter({ hasText: `kim_${tag}` });
    await expect(item.getByRole('img', { name: 'Foto de verificación' })).toBeVisible();
    await item.getByRole('button', { name: 'Aprobar insignia' }).click();
    await expect(item).toBeHidden();

    await kim.reload();
    await expect(kim.getByText('Tu perfil está verificado')).toBeVisible();
    await expect(kim.getByTitle('Perfil verificado por el equipo')).toBeVisible();
  } finally {
    await leave();
    await request.delete(`${API_URL}/admin/users/${id}`, { headers: adminHeaders() });
  }
});
