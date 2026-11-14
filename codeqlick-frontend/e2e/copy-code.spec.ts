import { expect, test } from '@playwright/test';

/*
 * Copy button on code blocks (architecture 6.2): code blocks in posts, case studies and the
 * Cloud docs get a "Copy" button that puts the block's text on the clipboard and says "Copied" for
 * 2 seconds. The Cloud docs are static content (src/content/cloud-docs.ts) on Cloud's own host,
 * cloud.localhost, which browsers treat as a secure context, so the Clipboard API is there.
 */
function cloudUrl(baseURL: string | undefined): string {
  const url = new URL(baseURL ?? 'http://localhost:3001');
  url.hostname = `cloud.${url.hostname}`;
  return url.origin;
}

test('the Cloud docs copy a code block to the clipboard', async ({ page, context, baseURL }) => {
  const origin = cloudUrl(baseURL);
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  await page.goto(`${origin}/en/docs`);

  const block = page.locator('pre').first();
  const expected = ((await block.locator('code').textContent()) ?? '').replace(/\n$/, '');
  expect(expected).not.toBe('');

  // The button sits next to its pre, inside the block's wrapper.
  const wrapper = block.locator('xpath=..');
  const button = wrapper.getByRole('button');
  await expect(button).toHaveText('Copy');
  await button.click();

  await expect(wrapper.locator('output')).toHaveText('Copied');
  await expect(button).toHaveText('Copied');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(expected);

  // Back to "Copy" after 2 seconds.
  await expect(button).toHaveText('Copy');
  await expect(wrapper.locator('output')).toHaveText('');
});

test('the copy button is reachable with the keyboard', async ({ page, context, baseURL }) => {
  const origin = cloudUrl(baseURL);
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  await page.goto(`${origin}/es/docs`);

  const button = page.locator('pre').first().locator('xpath=..').getByRole('button');
  await expect(button).toHaveText('Copiar');
  await button.focus();
  await expect(button).toBeFocused();
  await expect(button).toHaveCSS('opacity', '1');
  await page.keyboard.press('Enter');
  await expect(button).toHaveText('Copiado');
});
