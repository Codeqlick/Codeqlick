import { expect, test, type Page } from '@playwright/test';
import { adminHeaders, API_URL, runTag, signIn } from './helpers';

/*
 * Meetings on their own host (meetings.localhost) with two real browsers and a fake camera: the
 * owner signs in, creates a room and joins; a guest opens the link, types a name and knocks; the
 * owner lets them in, they see each other and chat, and the owner ends the meeting.
 */
test.use({
  launchOptions: {
    executablePath: process.env.E2E_CHROMIUM_PATH || undefined,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  },
});

function meetingsUrl(baseURL: string | undefined): string {
  const url = new URL(baseURL ?? 'http://localhost:3001');
  url.hostname = `meetings.${url.hostname}`;
  return url.origin;
}

/** Every video of the page that plays something (the person's own and the others'). */
async function playingVideos(page: Page): Promise<number> {
  return page
    .locator('video')
    .evaluateAll(
      (videos) => videos.filter((video) => (video as HTMLVideoElement).videoWidth > 0).length,
    );
}

test('an owner and a guest meet by link, chat, and the owner ends it', async ({
  browser,
  request,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const tag = runTag();
  const base = meetingsUrl(baseURL);
  const owner = {
    email: `e2e-meet-${tag}@codeqlick.test`,
    password: `meetings-pass-${tag}-0`,
  };
  const created = await request.post(`${API_URL}/admin/users`, {
    headers: adminHeaders(),
    data: { ...owner, name: `Olga ${tag}`, role: 'CLIENT', locale: 'es' },
  });
  expect(created.ok()).toBeTruthy();
  const ownerId = ((await created.json()) as { id: string }).id;

  const ownerContext = await browser.newContext({
    baseURL: base,
    permissions: ['camera', 'microphone'],
  });
  const guestContext = await browser.newContext({
    baseURL: base,
    permissions: ['camera', 'microphone'],
  });
  try {
    const host = await ownerContext.newPage();
    await signIn(host, owner, '/es/meetings');
    await expect(host).toHaveURL(`${base}/es`);

    await host.getByLabel('Nueva sala').fill(`Equipo ${tag}`);
    await host.getByRole('button', { name: 'Crear sala' }).click();
    await expect(host.getByText(`Equipo ${tag}`)).toBeVisible();
    const link = (await host.locator('code').first().textContent()) ?? '';
    expect(link).toMatch(/\/es\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/);

    await host.getByRole('link', { name: 'Entrar' }).first().click();
    await expect(host.getByText(`Entrarás como Olga ${tag}.`)).toBeVisible();
    await host.getByRole('button', { name: 'Unirme' }).click();
    await expect(host.getByRole('heading', { name: `Equipo ${tag}` })).toBeVisible();
    await expect(host.getByText('1 persona', { exact: false })).toBeVisible();

    // The guest opens the link without an account and knocks.
    const guest = await guestContext.newPage();
    await guest.goto(new URL(link).pathname);
    await expect(guest.getByText(`Sala de Olga ${tag}`)).toBeVisible();
    await guest.getByLabel('Tu nombre').fill('Gina');
    await guest.getByRole('button', { name: 'Unirme' }).click();
    await expect(guest.getByText('Esperando a que te dejen pasar')).toBeVisible();

    await expect(host.getByText('Gina quiere entrar')).toBeVisible();
    await host.getByRole('button', { name: 'Dejar pasar' }).click();

    // Both see two people and two playing videos (their own and the other's).
    await expect(guest.getByText('2 personas', { exact: false })).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => playingVideos(guest), { timeout: 20_000 }).toBe(2);
    await expect.poll(() => playingVideos(host), { timeout: 20_000 }).toBe(2);

    await guest.getByRole('button', { name: 'Chat' }).click();
    await guest.getByPlaceholder('Escribe un mensaje').fill('¡Hola a todos!');
    await guest.getByRole('button', { name: 'Enviar' }).click();
    await host.getByRole('button', { name: /^Chat/ }).click();
    await expect(host.getByText('¡Hola a todos!')).toBeVisible();

    // The guest mutes: the owner sees it on their tile.
    await guest.getByRole('button', { name: 'Silenciar' }).click();
    await expect(host.locator('figcaption', { hasText: 'Gina' })).toContainText('silenciado');

    await host.getByRole('button', { name: 'Personas' }).click();
    await host.getByRole('button', { name: 'Terminar para todos' }).click();
    await expect(guest.getByText('La reunión ha terminado')).toBeVisible();
  } finally {
    await ownerContext.close();
    await guestContext.close();
    await request.delete(`${API_URL}/admin/users/${ownerId}`, { headers: adminHeaders() });
  }
});
