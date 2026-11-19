import { expect, test } from '@playwright/test';

/*
 * The Content Security Policy (architecture 6.4) on the main pages of every host: no violation,
 * enforced or report-only, and the page hydrates. Only against a production build (`next dev`
 * sends no policy); CI runs it with CSP_ENFORCE=true, so a script without the nonce fails here.
 */

const PAGES: Record<string, string[]> = {
  '': ['/en', '/es/blog', '/en/contact', '/en/login', '/en/register', '/en/security', '/en/apps'],
  meetings: ['/en'],
  citas: ['/en'],
  menu: ['/en', '/en/reportar'],
  cloud: ['/en', '/en/docs'],
};

function hostUrl(baseURL: string | undefined, app: string): string {
  const url = new URL(baseURL ?? 'http://localhost:3001');
  if (app) url.hostname = `${app}.${url.hostname}`;
  return url.origin;
}

for (const [app, paths] of Object.entries(PAGES)) {
  test(`no CSP violation on ${app || 'the main site'}`, async ({ page, baseURL }) => {
    const origin = hostUrl(baseURL, app);
    // Through the browser, which resolves *.localhost (Node's resolver, on Windows, doesn't).
    const probe = await page.goto(`${origin}${paths[0]}`);
    if (!probe) throw new Error(`no response for ${origin}${paths[0]}`);
    const enforced = probe.headers()['content-security-policy'] ?? '';
    const reported = probe.headers()['content-security-policy-report-only'] ?? '';
    test.skip(!/'nonce-/.test(enforced + reported), 'no nonce policy (not a production build)');

    const violations: string[] = [];
    await page.exposeFunction('reportCspViolation', (text: string) => violations.push(text));
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (event) => {
        const report = (window as unknown as { reportCspViolation: (text: string) => void })
          .reportCspViolation;
        const where = event.sourceFile ? ` at ${event.sourceFile}:${event.lineNumber}` : '';
        const element = event.target instanceof Element ? event.target.outerHTML.slice(0, 160) : '';
        report(
          `${event.effectiveDirective} ${event.blockedURI} (${event.disposition})${where} ${event.sample} ${element}`.trim(),
        );
      });
    });

    for (const path of paths) {
      const response = await page.goto(`${origin}${path}`);
      expect(response?.status(), path).toBeLessThan(400);
      await page.waitForLoadState('networkidle');
      // Next.js hydrated: its router is there only when its scripts ran.
      await expect
        .poll(() => page.evaluate(() => 'next' in window && Boolean((window as never)['next'])))
        .toBe(true);
    }
    expect(violations).toEqual([]);
  });
}
