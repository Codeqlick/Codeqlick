import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { accountUrl, adminHeaders, API_URL, apiLogin, asAdmin, runTag } from './helpers';
import { WEBAPPS } from '../src/lib/webapps';

/*
 * Accessibility gate (architecture 9, roadmap #234): axe scans a fixed list of pages once they
 * have loaded, in both languages where the page has both. Any violation fails the test, whatever
 * its impact. An exception is allowed only per rule and per page, in EXCEPTIONS with its reason.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * Rule ids allowed to fail on one page, keyed by host + path (e.g. `localhost/es/work`,
 * `account.localhost/es/login`), so an exception never covers more than one page. Ideally empty.
 */
const EXCEPTIONS: Record<string, { rule: string; reason: string }[]> = {};

const LOCALES = ['es', 'en'] as const;

async function scan(page: Page, label: string) {
  await page.waitForLoadState('networkidle');
  const { hostname, pathname } = new URL(page.url());
  const pageKey = `${hostname}${pathname}`;
  let builder = new AxeBuilder({ page }).withTags(TAGS);
  // Next's dev indicator only exists in the dev server, never in the production build.
  if (!process.env.CI) builder = builder.exclude('nextjs-portal');
  const allowed = (EXCEPTIONS[pageKey] ?? []).map((exception) => exception.rule);
  if (allowed.length) builder = builder.disableRules(allowed);
  const { violations } = await builder.analyze();
  const report = violations
    .map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.help}\n` +
        violation.nodes.map((node) => `    ${node.target.join(' ')}`).join('\n') +
        `\n    ${violation.helpUrl}`,
    )
    .join('\n');
  if (violations.length)
    throw new Error(`Accessibility violations on ${label} (${pageKey}):\n${report}`);
}

async function scanPath(page: Page, path: string, base = '') {
  await page.goto(`${base}${path}`);
  await scan(page, path);
}

function appUrl(app: string, baseURL: string | undefined): string {
  const url = new URL(baseURL ?? 'http://localhost:3001');
  url.hostname = `${app}.${url.hostname}`;
  return url.origin;
}

const BODY = {
  en: [
    '## Shipping small',
    'Small changes are *easy* to review and **easy** to undo. See [our contact page](/en/contact).',
    '### What we do',
    '- Review every change',
    '- Deploy on merge',
    '- Watch the errors',
    '```sh\nnpx @codeqlick/cli deploy\n```',
    'Run `deploy` and you are done.',
  ].join('\n\n'),
  es: [
    '## Entregar en pequeño',
    'Los cambios pequeños son *fáciles* de revisar y **fáciles** de deshacer. Mira [nuestro contacto](/es/contact).',
    '### Qué hacemos',
    '- Revisar cada cambio',
    '- Desplegar al fusionar',
    '- Vigilar los errores',
    '```sh\nnpx @codeqlick/cli deploy\n```',
    'Ejecuta `deploy` y listo.',
  ].join('\n\n'),
};

test.describe('public site', () => {
  // A published post with real-looking content (headings, list, link, code), removed afterwards.
  const postSlug = `e2e-a11y-post-${runTag()}`;
  let postId: string;

  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    const base = process.env.E2E_BASE_URL ?? 'http://localhost:3001';
    const res = await request.post(`${API_URL}/admin/posts`, {
      headers: adminHeaders(),
      data: {
        slug: postSlug,
        status: 'PUBLISHED',
        publishedAt: new Date(Date.now() - 86_400_000).toISOString(),
        coverImageUrl: `${base}/og-image.png`,
        newsletter: false,
        translations: [
          {
            locale: 'en',
            title: 'Shipping small',
            excerpt: 'Why small changes win.',
            content: BODY.en,
          },
          {
            locale: 'es',
            title: 'Entregar en pequeño',
            excerpt: 'Por qué ganan los cambios pequeños.',
            content: BODY.es,
          },
        ],
      },
    });
    expect(res.ok(), `Creating the post: ${res.status()} ${await res.text()}`).toBeTruthy();
    postId = ((await res.json()) as { id: string }).id;
    await request.dispose();
  });

  test.afterAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    await request.delete(`${API_URL}/admin/posts/${postId}`, { headers: adminHeaders() });
    await request.dispose();
  });

  // A Security check's report (pending or failed: the API runs it for real) to scan too.
  let securityCheckId: string | undefined;
  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    const tag = runTag();
    const res = await request.post(`${API_URL}/security-checks`, {
      data: {
        domain: `e2e-a11y-${tag}.codeqlick.com`,
        email: `e2e-a11y-sec-${tag}@codeqlick.test`,
        locale: 'es',
        acceptPrivacy: true,
      },
    });
    if (res.ok()) securityCheckId = ((await res.json()) as { id: string }).id;
    await request.dispose();
  });

  for (const locale of LOCALES) {
    test(`/${locale}/security-check/<id>`, async ({ page }) => {
      test.skip(!securityCheckId, 'The API did not accept the check (rate limit)');
      await scanPath(page, `/${locale}/security-check/${securityCheckId}`);
    });

    for (const path of [
      '',
      '/basic-website',
      '/work',
      '/blog',
      '/contact',
      '/security-check',
      '/privacy',
      '/legal',
    ]) {
      test(`/${locale}${path}`, async ({ page }) => {
        await scanPath(page, `/${locale}${path}`);
      });
    }

    test(`/${locale}/blog/<post>`, async ({ page }) => {
      await scanPath(page, `/${locale}/blog/${postSlug}`);
    });
  }
});

test.describe('account host', () => {
  for (const locale of LOCALES) {
    for (const path of ['/login', '/register']) {
      test(`/${locale}${path}`, async ({ page }) => {
        await scanPath(page, `/${locale}${path}`, accountUrl());
      });
    }
  }
});

test.describe('web apps', () => {
  for (const app of WEBAPPS) {
    for (const locale of LOCALES) {
      test(`${app}.localhost /${locale}`, async ({ page, baseURL }) => {
        await scanPath(page, `/${locale}`, appUrl(app, baseURL));
      });
    }
  }

  // Menu's public report form (its public page needs a menu: the browser test of Menu scans it).
  for (const locale of LOCALES) {
    test(`menu.localhost /${locale}/reportar`, async ({ page, baseURL }) => {
      await scanPath(page, `/${locale}/reportar?menu=mi-bar`, appUrl('menu', baseURL));
    });
  }

  test('the menu dialog, open', async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${appUrl('meetings', baseURL)}/es`);
    await page.getByRole('banner').getByRole('button', { name: 'Menú' }).click();
    await expect(page.getByRole('dialog', { name: 'Menú' })).toBeVisible();
    await scan(page, 'meetings menu dialog');
  });
});

test.describe('admin panel', () => {
  for (const locale of LOCALES) {
    test(`/${locale}/admin`, async ({ page, context, baseURL }) => {
      await asAdmin(context, baseURL!);
      await scanPath(page, `/${locale}/admin`);
    });

    test(`/${locale}/admin/security-checks`, async ({ page, context, baseURL }) => {
      await asAdmin(context, baseURL!);
      await scanPath(page, `/${locale}/admin/security-checks`);
    });
  }
});

test.describe('client portal', () => {
  let client: { email: string; password: string };
  let signIn: (context: BrowserContext, baseURL: string) => Promise<void>;

  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    const tag = runTag();
    client = { email: `e2e-a11y-${tag}@codeqlick.test`, password: `client-pass-${tag}-0` };
    const admin = adminHeaders();
    const user = await request.post(`${API_URL}/admin/users`, {
      headers: admin,
      data: {
        email: client.email,
        name: `Cliente ${tag}`,
        role: 'CLIENT',
        password: client.password,
        locale: 'es',
      },
    });
    expect(user.ok(), `Creating the client: ${user.status()} ${await user.text()}`).toBeTruthy();
    const clientId = ((await user.json()) as { id: string }).id;
    const project = await request.post(`${API_URL}/admin/projects`, {
      headers: admin,
      data: { clientId, name: `Tienda ${tag}`, phase: 'DESIGN', progress: 30 },
    });
    expect(
      project.ok(),
      `Creating the project: ${project.status()} ${await project.text()}`,
    ).toBeTruthy();
    const projectId = ((await project.json()) as { id: string }).id;
    const update = await request.post(`${API_URL}/admin/projects/${projectId}/updates`, {
      headers: admin,
      data: { title: 'Propuesta de portada', body: 'Dos opciones.', requestApproval: true },
    });
    expect(
      update.ok(),
      `Creating the update: ${update.status()} ${await update.text()}`,
    ).toBeTruthy();
    const token = await apiLogin(request, client);
    signIn = (context, baseURL) =>
      context.addCookies([{ name: 'cq_at', value: token, url: baseURL, httpOnly: true }]);
    await request.dispose();
  });

  for (const locale of LOCALES) {
    test(`/${locale}/portal`, async ({ page, context, baseURL }) => {
      await signIn(context, baseURL!);
      await scanPath(page, `/${locale}/portal`);
    });
  }
});
