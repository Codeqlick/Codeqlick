import { expect, test } from '@playwright/test';
import { adminHeaders, API_URL, runTag, signIn } from './helpers';

// Chromium's virtual authenticator (DevTools protocol) stands in for Touch ID or a phone.
test('a client adds a passkey in their account and signs in with it', async ({ page, request }) => {
  const tag = runTag();
  const client = {
    email: `e2e-passkey-${tag}@codeqlick.test`,
    password: `client-passkey-${tag}-0`,
  };
  const created = await request.post(`${API_URL}/admin/users`, {
    headers: adminHeaders(),
    data: { ...client, name: `Cliente ${tag}`, role: 'CLIENT', locale: 'es' },
  });
  expect(created.ok()).toBeTruthy();
  const { id: clientId } = (await created.json()) as { id: string };

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  try {
    await signIn(page, client, '/es/portal/account');
    await page.goto('/es/portal/account');
    const passkeys = page.getByRole('region', { name: 'Llaves de acceso' });
    await expect(passkeys.getByText('Aún no has añadido ninguna llave de acceso.')).toBeVisible();

    await passkeys.locator('#passkey-new-name').fill('Portátil de pruebas');
    await passkeys.locator('#passkey-new-password').fill(client.password);
    await passkeys.getByRole('button', { name: 'Añadir una llave de acceso' }).click();
    await expect(passkeys.getByText('Llave de acceso añadida.')).toBeVisible();
    await expect(passkeys.getByText('Portátil de pruebas', { exact: true })).toBeVisible();
    await expect(passkeys.getByText('1 de 10 llaves de acceso')).toBeVisible();

    // Signed out, the passkey alone signs in: no password, no code. First from the email field's
    // suggestions (conditional UI), which the virtual authenticator accepts at once.
    await page.context().clearCookies();
    await page.goto('/es/login?next=%2Fes%2Fportal%2Faccount');
    // The Server Action redirects: a client-side navigation, so no new page load to wait for.
    await expect(page).toHaveURL(/\/es\/portal\/account$/);
    await expect(passkeys.getByText(/usada por última vez/)).toBeVisible();

    // Then with the button, in a browser without those suggestions.
    await page.addInitScript(() => {
      PublicKeyCredential.isConditionalMediationAvailable = async () => false;
    });
    await page.context().clearCookies();
    await page.goto('/es/login?next=%2Fes%2Fportal%2Faccount');
    await expect(page.getByLabel('Correo electrónico')).toHaveAttribute(
      'autocomplete',
      'username webauthn',
    );
    await page.getByRole('button', { name: 'Entrar con una llave de acceso' }).click();
    await expect(page).toHaveURL(/\/es\/portal\/account$/);
    await expect(passkeys.getByText('Portátil de pruebas', { exact: true })).toBeVisible();
  } finally {
    await request.patch(`${API_URL}/admin/users/${clientId}`, {
      headers: adminHeaders(),
      data: { isActive: false },
    });
  }
});
