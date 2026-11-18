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

/** Rule ids allowed to fail on one page, keyed by the page's path (e.g. `/es/work`). Ideally empty. */
const EXCEPTIONS: Record<string, { rule: string; reason: string }[]> = {};

const LOCALES = ['es', 'en'] as const;

async function scan(page: Page, key: string) {
  await page.waitForLoadState('networkidle');
  let builder = new AxeBuilder({ page }).withTags(TAGS);
  // Next's dev indicator only exists in the dev server, never in the production build.
  if (!process.env.CI) builder = builder.exclude('nextjs-portal');
  const allowed = (EXCEPTIONS[key] ?? []).map((exception) => exception.rule);
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
  if (violations.length) throw new Error(`Accessibility violations on ${key}:\n${report}`);
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

test.describe('public site', () => {
  for (const locale of LOCALES) {
    for (const path of ['', '/basic-website', '/work', '/blog', '/contact', '/privacy', '/legal']) {
      test(`/${locale}${path}`, async ({ page }) => {
        await scanPath(page, `/${locale}${path}`);
      });
    }

    test(`/${locale}/blog/<first post>`, async ({ page }) => {
      await page.goto(`/${locale}/blog`);
      const post = page.locator(`a[href^="/${locale}/blog/"]`).first();
      test.skip((await post.count()) === 0, 'No published post to scan');
      const href = (await post.getAttribute('href'))!;
      await scanPath(page, href);
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
    expect(user.ok()).toBeTruthy();
    const clientId = ((await user.json()) as { id: string }).id;
    const project = await request.post(`${API_URL}/admin/projects`, {
      headers: admin,
      data: { clientId, name: `Tienda ${tag}`, phase: 'DESIGN', progress: 30 },
    });
    const projectId = ((await project.json()) as { id: string }).id;
    await request.post(`${API_URL}/admin/projects/${projectId}/updates`, {
      headers: admin,
      data: { title: 'Propuesta de portada', body: 'Dos opciones.', requestApproval: true },
    });
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
