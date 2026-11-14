import { expect, test, type Locator, type Page } from '@playwright/test';
import { adminHeaders, API_URL, runTag } from './helpers';

/*
 * Linkable headings and table of contents (architecture 6.2): Markdown on legal pages, posts and
 * case studies gives every ## and ### an id and a "#" link to it; posts with three or more ## show
 * a "Contents" list linking to those ids. Reduced motion turns smooth scrolling off, so a jump to
 * an anchor lands at once.
 */
test.use({ reducedMotion: 'reduce' });

/** The heading is on screen and not under the sticky header (scroll-padding / scroll-margin). */
async function expectLandedOn(page: Page, heading: Locator) {
  await expect(heading).toBeInViewport();
  await expect
    .poll(async () => {
      const header = await page.getByRole('banner').boundingBox();
      const target = await heading.boundingBox();
      return header && target ? target.y - (header.y + header.height) : -1;
    })
    .toBeGreaterThanOrEqual(0);
}

test('a legal page links its headings and shows no table of contents', async ({ page }) => {
  // Static content (src/content/security.ts): no data to seed.
  await page.goto('/es/security');
  const heading = page.getByRole('heading', { level: 2, name: 'Qué hacemos nosotros' });
  await expect(heading).toHaveAttribute('id', 'que-hacemos-nosotros');
  const anchor = heading.getByRole('link', { name: 'Enlace a esta sección' });
  await expect(anchor).toHaveAttribute('href', '#que-hacemos-nosotros');
  await heading.hover();
  await expect(anchor).toHaveCSS('opacity', '1');
  await expect(page.getByRole('navigation', { name: 'Contenido', exact: true })).toHaveCount(0);

  await anchor.click();
  await expect(page).toHaveURL(/\/es\/security#que-hacemos-nosotros$/);
  await expectLandedOn(page, heading);

  // An address with the anchor, opened fresh, lands on the heading too.
  await page.goto('/es/security#reglas-de-buena-fe');
  await expectLandedOn(page, page.locator('h2#reglas-de-buena-fe'));
});

test('a post with three sections shows contents that link to its headings', async ({
  page,
  request,
}) => {
  const slug = `e2e-toc-${runTag()}`;
  const content = [
    '## Why small changes',
    'They are easy to undo.',
    '### Undo in `minutes`',
    'One revert.',
    '## Café & ñandú',
    'Accents and symbols leave the anchor.',
    '## Why small changes',
    'A repeated title gets its own anchor.',
  ].join('\n\n');
  const created = await request.post(`${API_URL}/admin/posts`, {
    headers: adminHeaders(),
    data: {
      slug,
      status: 'PUBLISHED',
      translations: [
        { locale: 'en', title: `Anchors ${slug}`, excerpt: 'Headings you can link.', content },
      ],
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const { id } = (await created.json()) as { id: string };
  try {
    await page.goto(`/en/blog/${slug}`);
    const contents = page.getByRole('navigation', { name: 'Contents', exact: true });
    await expect(contents).toBeVisible();
    const hrefs = await contents
      .getByRole('link')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
    expect(hrefs).toEqual([
      '#why-small-changes',
      '#undo-in-minutes',
      '#cafe-nandu',
      '#why-small-changes-2',
    ]);
    // Every entry points at exactly one heading of the text, with its own "#" link.
    for (const href of hrefs) {
      const target = page.locator(`[id="${href.slice(1)}"]`);
      await expect(target, href).toHaveCount(1);
      await expect(
        target.getByRole('link', { name: 'Link to this section' }),
        href,
      ).toHaveAttribute('href', href);
    }
    await expect(page.getByRole('heading', { level: 2, name: 'Café & ñandú' })).toHaveAttribute(
      'id',
      'cafe-nandu',
    );

    await contents.getByRole('link', { name: 'Why small changes' }).last().click();
    await expect(page).toHaveURL(new RegExp(`/en/blog/${slug}#why-small-changes-2$`));
    await expectLandedOn(page, page.locator('h2#why-small-changes-2'));
  } finally {
    await request.delete(`${API_URL}/admin/posts/${id}`, { headers: adminHeaders() });
  }
});
