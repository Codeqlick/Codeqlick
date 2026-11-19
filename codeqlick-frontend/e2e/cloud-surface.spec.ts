import { expect, test } from '@playwright/test';
import { adminHeaders, API_URL, apiLogin, runTag } from './helpers';

/**
 * The Surface monitor in Cloud's console (architecture 4.13, decision 144).
 *
 * Limits of what a browser test can seed: a domain only becomes VERIFIED by publishing the
 * `_codeqlick` TXT record in real DNS, and a scan is written by the scheduled job; neither has a
 * test-only path (and none must be added). So the switch (it exists only for verified domains)
 * and a scan with its findings, changes and history are covered by the API's e2e tests
 * (`codeqlick-backend/test/cloud-surface.e2e-spec.ts`) and by the unit tests of
 * `src/lib/surface.ts`. Here: what a team sees while its domain is still pending, and the
 * domain's security page with nothing scanned yet, in both languages.
 */
test('a pending domain has no security monitor switch, and its security page explains the empty state', async ({
  page,
  request,
  baseURL,
}) => {
  const tag = runTag();
  const user = { email: `e2e-surface-${tag}@codeqlick.test`, password: `surface-${tag}-pass-0` };
  const created = await request.post(`${API_URL}/admin/users`, {
    headers: adminHeaders(),
    data: { ...user, name: `Surface ${tag}`, role: 'CLIENT', locale: 'es' },
  });
  expect(created.ok()).toBeTruthy();
  const userId = ((await created.json()) as { id: string }).id;

  try {
    const token = await apiLogin(request, user);
    const auth = { Authorization: `Bearer ${token}` };

    // Cloud set-up through the API: a team, a project and a domain that is not verified.
    const slug = `e2e-surface-${tag}`;
    const shop = `shop-${tag}`;
    const team = await request.post(`${API_URL}/cloud/teams`, {
      headers: auth,
      data: { name: `Surface ${tag}`, slug, acceptTerms: true, termsVersion: '2026-11-17' },
    });
    expect(team.status()).toBe(201);
    const project = await request.post(`${API_URL}/cloud/teams/${slug}/projects`, {
      headers: auth,
      data: { name: 'Shop', slug: shop },
    });
    expect(project.status()).toBe(201);
    const projectId = ((await project.json()) as { id: string }).id;
    const domainName = `surface-${tag}.example.com`;
    const added = await request.post(`${API_URL}/cloud/projects/${projectId}/domains`, {
      headers: auth,
      data: { name: domainName },
    });
    expect(added.status()).toBe(201);
    const domain = (await added.json()) as { id: string; state: string };
    expect(domain.state).toBe('PENDING');
    const listed = await request.get(`${API_URL}/cloud/projects/${projectId}/domains`, {
      headers: auth,
    });
    expect(
      ((await listed.json()) as { items: Array<{ id: string; surfaceMonitor: boolean }> }).items,
    ).toEqual([expect.objectContaining({ id: domain.id, surfaceMonitor: false })]);

    // The API refuses to switch a pending domain on, and the console doesn't offer it.
    const refused = await request.patch(
      `${API_URL}/cloud/projects/${projectId}/domains/${domain.id}`,
      { headers: auth, data: { surfaceMonitor: true } },
    );
    expect(refused.status()).toBe(409);

    const cloud = (baseURL ?? '').replace('://', '://cloud.');
    await page.context().addCookies([{ name: 'cq_at', value: token, url: cloud, httpOnly: true }]);

    // Domains tab, in Spanish: the domain is listed and has no security monitor.
    await page.goto(`${cloud}/es/console/${slug}/${shop}?tab=domains`);
    await expect(page.getByText(domainName).first()).toBeVisible();
    await expect(page.getByText('Monitor de seguridad')).toHaveCount(0);
    await expect(page.getByLabel('Vigila la seguridad de este dominio cada día')).toHaveCount(0);

    // The domain's security page: nothing scanned, the monitor is off.
    const security = `${cloud}/es/console/${slug}/${shop}/domains/${domain.id}/security`;
    await page.goto(security);
    await expect(page.getByRole('heading', { level: 1, name: domainName })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Todavía no hay análisis' })).toBeVisible();
    await expect(page.getByText('El monitor está desactivado en este dominio')).toBeVisible();
    await expect(page.getByText('Solo se hacen comprobaciones pasivas')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Actívalo en Dominios' })).toHaveAttribute(
      'href',
      new RegExp(`/es/console/${slug}/${shop}\\?tab=domains$`),
    );
    // No scans: no history table either.
    await expect(page.getByRole('table')).toHaveCount(0);

    // The same page in English.
    await page.goto(`${cloud}/en/console/${slug}/${shop}/domains/${domain.id}/security`);
    await expect(page.getByRole('heading', { name: 'No scans yet' })).toBeVisible();
    await expect(page.getByText('Only passive checks run')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Turn it on in Domains' })).toBeVisible();

    // A scan that is not asked for does not exist; an id that is not an id is a 404.
    const unknown = await page.goto(
      `${cloud}/en/console/${slug}/${shop}/domains/00000000-0000-4000-8000-000000000000/security`,
    );
    expect(unknown?.status()).toBe(404);
    const notAnId = await page.goto(`${cloud}/en/console/${slug}/${shop}/domains/nope/security`);
    expect(notAnId?.status()).toBe(404);
  } finally {
    await request.patch(`${API_URL}/admin/users/${userId}`, {
      headers: adminHeaders(),
      data: { isActive: false },
    });
  }
});
