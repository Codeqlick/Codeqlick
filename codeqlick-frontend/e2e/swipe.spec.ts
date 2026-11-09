import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { adminHeaders, API_URL, asAdmin, runTag, signIn } from './helpers';
import { testPng } from './images';

/*
 * Swipe on its own host (swipe.localhost): two people get in (18+ step, nickname, verification
 * photo, a photo), the admin approves them from the moderation page, they like each other's
 * photos, match and talk.
 */
test.use({
  launchOptions: { executablePath: process.env.E2E_CHROMIUM_PATH || undefined },
});

function swipeUrl(baseURL: string | undefined): string {
  const url = new URL(baseURL ?? 'http://localhost:3001');
  url.hostname = `swipe.${url.hostname}`;
  return url.origin;
}

const open: BrowserContext[] = [];

/** Picks a generated image in a Swipe upload, confirms consent, sends it and waits for `sent`. */
async function upload(page: Page, pick: string, consent: RegExp, seed: number, sent: string) {
  const input = page.getByLabel(pick, { exact: true });
  // The upload's own box: the photos page has two (public photos and the private album).
  const box = input.locator('..');
  await input.setInputFiles({
    name: `photo-${seed}.png`,
    mimeType: 'image/png',
    buffer: testPng(seed),
  });
  await box.getByLabel(consent).check();
  await box.getByRole('button', { name: 'Enviar para revisar' }).click();
  // The page reloads with the new state once the upload is through.
  await expect(page.getByText(sent).first()).toBeVisible({ timeout: 20_000 });
}

/** Signs in on Swipe's host, passes the 18+ step, picks a nickname and sends the verification. */
async function member(
  browser: Browser,
  base: string,
  user: { email: string; password: string },
  nickname: string,
  seed: number,
) {
  const context = await browser.newContext({ baseURL: base });
  open.push(context);
  const page = await context.newPage();
  await signIn(page, user, '/es/swipe/deck');
  await expect(page).toHaveURL(`${base}/es/deck`);
  await page.getByLabel('Fecha de nacimiento').fill('1992-05-20');
  await page.getByLabel(/Tengo 18 años o más/).check();
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByLabel('Fecha de nacimiento')).toBeHidden();

  await page.goto('/es/photos');
  await page.getByLabel('Apodo').fill(nickname);
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Perfil guardado.')).toBeVisible();
  await page.reload();
  await upload(
    page,
    'Elige la foto',
    /Soy yo, soy mayor de 18 años/,
    seed,
    'Estamos revisando tu foto de verificación',
  );
  return page;
}

test('two people get approved, match on Swipe and talk', async ({ browser, request, baseURL }) => {
  test.setTimeout(180_000);
  const tag = runTag();
  const base = swipeUrl(baseURL);
  const users = ['ana', 'ben'].map((name) => ({
    name,
    nickname: `${name === 'ana' ? 'Ana' : 'Ben'} ${tag}`,
    email: `e2e-swipe-${name}-${tag}@codeqlick.test`,
    password: `swipe-pass-${tag}-0`,
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
  const [anaUser, benUser] = users as [(typeof users)[0], (typeof users)[0]];

  try {
    const ana = await member(browser, base, anaUser, anaUser.nickname, 1);
    const ben = await member(browser, base, benUser, benUser.nickname, 2);

    // The admin approves both verifications from the moderation page (main host).
    const adminContext = await browser.newContext({ baseURL });
    open.push(adminContext);
    await asAdmin(adminContext, baseURL!);
    const admin = await adminContext.newPage();
    await admin.goto('/es/admin/swipe');
    for (const user of users) {
      const item = admin.locator('article').filter({ hasText: user.nickname });
      await item.getByRole('button', { name: 'Aprobar' }).click();
      await expect(item).toBeHidden();
    }

    // Verified, each sends a photo; the admin publishes Ana's from the page, Ben's through the API.
    for (const [page, seed] of [
      [ana, 11],
      [ben, 12],
    ] as const) {
      await page.reload();
      await expect(page.getByText('Verificada. Ya puedes subir fotos.')).toBeVisible();
      await upload(page, 'Elige una foto', /Solo aparezco yo/, seed, 'En revisión');
    }
    await admin.reload();
    const anaPhoto = admin.locator('article').filter({ hasText: anaUser.nickname });
    await anaPhoto.getByRole('button', { name: 'Publicar' }).click();
    await expect(anaPhoto).toBeHidden();
    const pending = await request.get(`${API_URL}/admin/swipe/photos?status=PENDING`, {
      headers: adminHeaders(),
    });
    const { items } = (await pending.json()) as {
      items: Array<{ id: string; owner: { id: string } }>;
    };
    const benPhoto = items.find((photo) => photo.owner.id === ids[1]);
    expect(benPhoto).toBeTruthy();
    const approved = await request.post(`${API_URL}/admin/swipe/photos/${benPhoto!.id}/approve`, {
      headers: adminHeaders(),
    });
    expect(approved.ok()).toBeTruthy();

    // Ben likes Ana's photo; then Ana likes his: a match.
    await ben.goto('/es/deck');
    await expect(ben.getByAltText(`Foto de ${anaUser.nickname}`)).toBeVisible();
    // Everyone who posts photos was verified: the card shows the badge.
    await expect(ben.getByTitle('Perfil verificado por el equipo')).toBeVisible();
    await ben.getByRole('button', { name: 'Me gusta', exact: true }).click();
    await ana.goto('/es/deck');
    await expect(ana.getByAltText(`Foto de ${benUser.nickname}`)).toBeVisible();
    await ana.getByRole('button', { name: 'Me gusta', exact: true }).click();
    await expect(ana.getByText(`¡Match con ${benUser.nickname}!`)).toBeVisible();

    // They talk: Ana writes from the match, Ben reads it in his matches.
    await ana.getByRole('link', { name: 'Escribir' }).click();
    await ana.getByPlaceholder('Escribe un mensaje…').fill('¡Hola, Ben!');
    await ana.getByRole('button', { name: 'Enviar' }).click();
    await ben.goto('/es/matches');
    await ben.getByRole('link', { name: new RegExp(anaUser.nickname) }).click();
    await expect(ben.getByText('¡Hola, Ben!')).toBeVisible({ timeout: 15_000 });

    // Ana's week: Ben saw and liked her photo, and they matched.
    await ana.goto('/es/photos');
    const week = ana.getByRole('region', { name: 'Tu semana' });
    await expect(week.getByText('Matches')).toBeVisible();
    await expect(week.locator('dd').nth(0)).toHaveText('1');
  } finally {
    await Promise.all(open.splice(0).map((context) => context.close()));
    for (const id of ids) {
      await request.delete(`${API_URL}/admin/users/${id}`, { headers: adminHeaders() });
    }
  }
});
