import { describe, expect, it } from 'vitest';
import { COMMON_RESERVED_SLUGS } from '../../common/reserved-slugs.js';
import {
  defaultContent,
  newKey,
  normalizeAllergens,
  parseContent,
  publicContent,
  withItemFlags,
  withoutAllergens,
  type MenuContent,
} from './menu-content.js';
import { ALLERGENS, CURRENCIES, DEFAULT_CURRENCY, menuLimits } from './menu-limits.js';
import { menuQrSvg } from './menu-qr.js';
import { slugProblem } from './menu-slug.js';
import { textProblem, visibleText } from './menu-text.js';
import { createMenuSchema, updateMenuSchema } from './menus.schemas.js';
import { reportsCutoff } from './menus-maintenance.service.js';

const limits = menuLimits({ id: 'u' });
const parse = (input: unknown, kind: 'MENU' | 'CATALOGUE' = 'MENU') =>
  parseContent(input, { kind, limits });
const items = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ name: `Plato ${index}` }));

describe('slug rules (architecture 4.20)', () => {
  const user = { admin: false };

  it('accepts 3-40 lowercase letters, digits and single dashes', () => {
    expect(slugProblem('bar-pepe', user)).toBeNull();
    expect(slugProblem('abc', user)).toBeNull();
    expect(slugProblem('a'.repeat(40), user)).toBeNull();
    expect(slugProblem('bar-2', user)).toBeNull();
  });

  it('refuses the wrong shape as invalid', () => {
    for (const slug of [
      'ab',
      'a'.repeat(41),
      'Bar-Pepe',
      'bar--pepe',
      '-bar',
      'bar-',
      'bar_pepe',
    ]) {
      expect(slugProblem(slug, user)).toBe('invalid');
    }
  });

  it('reserves the app routes, the locales, the web apps and the shared words', () => {
    for (const slug of ['editar', 'cartel', 'reportar', 'disponibilidad', 'poster', 'menu']) {
      expect(slugProblem(slug, user)).toBe('reserved');
    }
    for (const slug of ['admin', 'api', 'www', 'login', 'citas', 'blog']) {
      expect(slugProblem(slug, user)).toBe('reserved');
    }
    expect(COMMON_RESERVED_SLUGS).toContain('account');
  });

  it('keeps `codeqlick` for admins only', () => {
    expect(slugProblem('codeqlick-bar', user)).toBe('reserved');
    expect(slugProblem('micodeqlick', user)).toBe('reserved');
    expect(slugProblem('codeqlick-demo', { admin: true })).toBeNull();
    // Admins are still bound by the other rules.
    expect(slugProblem('editar', { admin: true })).toBe('reserved');
  });
});

describe('plain text (architecture 4.20, Abuse)', () => {
  it('accepts ordinary text, accents and emoji', () => {
    for (const text of ['Tortilla de patatas', 'Café con leche ☕', 'Menú 12,50 €', 'desde 9']) {
      expect(textProblem(text)).toBeNull();
    }
  });

  it('refuses anything that looks like a link', () => {
    for (const text of [
      'http://x.com',
      'HTTPS://x.com',
      'ftp://files',
      'visit www.bar.com',
      'javascript://alert',
    ]) {
      expect(textProblem(text)).toBe('Links are not allowed in a menu');
    }
  });

  it('finds links hidden with zero width characters and fullwidth letters', () => {
    const at = (code: number, text: string) => text.replace('|', String.fromCodePoint(code));
    for (const text of [
      at(0x200b, 'www|.bar.com'),
      at(0x200b, 'ht|tp://bar.com'),
      at(0x00ad, 'w|ww.bar.com'),
      at(0x2060, 'https:|//bar.com'),
      at(0x200d, 'w|ww.bar.com'),
      at(0x200d, 'https|://bar.com'),
      'www' + String.fromCodePoint(0x3002) + 'bar.com',
      'www' + String.fromCodePoint(0xff61) + 'bar.com',
      'ｗｗｗ． bar.com',
    ]) {
      expect(textProblem(text)).toBe('Links are not allowed in a menu');
    }
  });

  it('keeps emoji sequences and accents', () => {
    const family = ['👨', '👩', '👧'].join(String.fromCodePoint(0x200d));
    const heart = '❤' + String.fromCodePoint(0xfe0f);
    for (const text of [family, heart, 'Crème brûlée', 'Ñoquis']) {
      expect(textProblem(text)).toBeNull();
    }
    // The joiner only matters for display: the link test looks at the text without it.
    expect(visibleText(family)).toBe(['👨', '👩', '👧'].join(''));
  });

  it('refuses control characters and text direction overrides', () => {
    const at = (code: number) => `a${String.fromCodePoint(code)}b`;
    for (const text of [at(10), at(9), at(0), at(0x202e), at(0x2028)]) {
      expect(textProblem(text)).toBe('Control characters are not allowed');
    }
  });
});

describe('content validation', () => {
  it('accepts a menu and normalises it', () => {
    const result = parse({
      categories: [
        {
          name: ' Entrantes ',
          items: [
            {
              name: 'Croquetas',
              description: '',
              price: '12,50',
              allergens: ['milk', 'gluten', 'milk'],
              hidden: false,
              soldOut: true,
            },
          ],
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [category] = result.content.categories;
    expect(category?.name).toBe('Entrantes');
    expect(category?.key).toMatch(/^[a-z0-9]{8}$/);
    expect(category?.items[0]).toEqual({
      key: expect.stringMatching(/^[a-z0-9]{8}$/),
      name: 'Croquetas',
      price: '12,50',
      // Without repeats, in the page's order.
      allergens: ['gluten', 'milk'],
      soldOut: true,
    });
  });

  it('keeps the keys it is given and generates the missing ones, all different', () => {
    const result = parse({
      categories: [
        { key: 'abcd1234', name: 'A', items: [{ key: 'zzzz9999', name: 'x' }, ...items(5)] },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const keys = result.content.categories.flatMap((c) => [c.key, ...c.items.map((i) => i.key)]);
    expect(keys).toContain('abcd1234');
    expect(keys).toContain('zzzz9999');
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('refuses a repeated key', () => {
    const result = parse({
      categories: [{ key: 'abcd1234', name: 'A', items: [{ key: 'abcd1234', name: 'x' }] }],
    });
    expect(result).toMatchObject({
      ok: false,
      errors: [{ path: 'content.categories.0.items.0.key', message: expect.any(String) }],
    });
  });

  it('refuses a key that is not 8 lowercase letters or digits', () => {
    expect(parse({ categories: [{ key: 'ABC', name: 'A', items: [] }] }).ok).toBe(false);
  });

  it('limits categories to 1-20 and items to 0-60 (the free plan)', () => {
    expect(parse({ categories: [] }).ok).toBe(false);
    const category = (name: string) => ({ name, items: [] });
    expect(parse({ categories: Array.from({ length: 20 }, (_, i) => category(`c${i}`)) }).ok).toBe(
      true,
    );
    expect(parse({ categories: Array.from({ length: 21 }, (_, i) => category(`c${i}`)) }).ok).toBe(
      false,
    );
    expect(parse({ categories: [{ name: 'A', items: items(60) }] }).ok).toBe(true);
    const over = parse({ categories: [{ name: 'A', items: items(61) }] });
    expect(over).toMatchObject({ ok: false, errors: [{ path: 'content.categories.0.items' }] });
  });

  it('limits the length of every text', () => {
    expect(parse({ categories: [{ name: 'x'.repeat(61), items: [] }] }).ok).toBe(false);
    expect(parse({ categories: [{ name: 'A', items: [{ name: 'x'.repeat(81) }] }] }).ok).toBe(
      false,
    );
    expect(
      parse({ categories: [{ name: 'A', items: [{ name: 'x', description: 'x'.repeat(201) }] }] })
        .ok,
    ).toBe(false);
    expect(
      parse({ categories: [{ name: 'A', items: [{ name: 'x', price: 'x'.repeat(21) }] }] }).ok,
    ).toBe(false);
    expect(parse({ categories: [{ name: 'A', items: [{ name: ' ' }] }] }).ok).toBe(false);
  });

  it('refuses links in any text, with the path of the field', () => {
    const result = parse({
      categories: [{ name: 'A', items: [{ name: 'Visit www.bar.com' }] }],
    });
    expect(result).toEqual({
      ok: false,
      errors: [
        { path: 'content.categories.0.items.0.name', message: 'Links are not allowed in a menu' },
      ],
    });
  });

  it('refuses unknown fields and unknown allergens', () => {
    expect(parse({ categories: [{ name: 'A', items: [], extra: 1 }] }).ok).toBe(false);
    expect(
      parse({ categories: [{ name: 'A', items: [{ name: 'x', allergens: ['kiwi'] }] }] }).ok,
    ).toBe(false);
  });

  it('caps the whole content at 200 KB', () => {
    // 20 x 60 items of 80 + 200 + 20 characters is over the cap (more than 300 KB).
    const full = {
      categories: Array.from({ length: 20 }, (_, c) => ({
        name: `Categoría ${c}`,
        items: Array.from({ length: 60 }, (_unused, i) => ({
          name: 'n'.repeat(80),
          description: 'd'.repeat(200),
          price: 'p'.repeat(20),
          allergens: [...ALLERGENS],
          key: `${c.toString().padStart(2, '0')}${i.toString().padStart(2, '0')}abcd`,
        })),
      })),
    };
    expect(parse(full)).toEqual({
      ok: false,
      errors: [{ path: 'content', message: 'The content is over 200 KB' }],
    });
  });

  it('gives a catalogue no allergens', () => {
    const withAllergens = {
      categories: [{ name: 'A', items: [{ name: 'x', allergens: ['milk'] }] }],
    };
    expect(parse(withAllergens, 'CATALOGUE')).toMatchObject({
      ok: false,
      errors: [{ path: 'content.categories.0.items.0.allergens' }],
    });
    expect(
      parse({ categories: [{ name: 'A', items: [{ name: 'x', allergens: [] }] }] }, 'CATALOGUE').ok,
    ).toBe(true);
  });

  it('has a default content of one empty category named for the kind and language', () => {
    expect(defaultContent('MENU', 'ES').categories).toMatchObject([{ name: 'Carta', items: [] }]);
    expect(defaultContent('CATALOGUE', 'EN').categories).toMatchObject([
      { name: 'Catalogue', items: [] },
    ]);
  });

  it('generates 8-character keys', () => {
    expect(newKey()).toMatch(/^[a-z0-9]{8}$/);
    expect(newKey()).not.toBe(newKey());
  });
});

describe('allergens and currencies', () => {
  it('knows the 14 allergens the EU requires', () => {
    expect(ALLERGENS).toHaveLength(14);
    expect(new Set(ALLERGENS).size).toBe(14);
  });

  it('puts allergens in the shown order, without repeats', () => {
    expect(normalizeAllergens(['sesame', 'gluten', 'sesame', 'eggs'])).toEqual([
      'gluten',
      'eggs',
      'sesame',
    ]);
    expect(normalizeAllergens([])).toEqual([]);
  });

  it('offers the owner-approved currencies, EUR first', () => {
    expect([...CURRENCIES]).toEqual(['EUR', 'GBP', 'USD', 'CHF', 'MXN', 'COP', 'ARS', 'CLP']);
    expect(DEFAULT_CURRENCY).toBe('EUR');
  });

  it('accepts only those currencies in a request', () => {
    const base = { slug: 'bar-pepe', kind: 'MENU', businessName: 'Bar Pepe', language: 'ES' };
    expect(createMenuSchema.safeParse({ ...base, currency: 'CLP' }).success).toBe(true);
    expect(createMenuSchema.safeParse({ ...base, currency: 'JPY' }).success).toBe(false);
    expect(createMenuSchema.safeParse({ ...base }).success).toBe(true);
  });
});

describe('what the public page gets', () => {
  const content: MenuContent = {
    categories: [
      {
        key: 'cat00001',
        name: 'Entrantes',
        items: [
          { key: 'it000001', name: 'Croquetas', allergens: ['milk'], soldOut: true },
          { key: 'it000002', name: 'Secreto', hidden: true },
        ],
      },
      {
        key: 'cat00002',
        name: 'Postres',
        items: [{ key: 'it000003', name: 'Flan', hidden: true }],
      },
      { key: 'cat00003', name: 'Vacía', items: [] },
    ],
  };

  it('leaves out hidden items and the categories left empty', () => {
    expect(publicContent(content, 'MENU')).toEqual({
      categories: [
        {
          key: 'cat00001',
          name: 'Entrantes',
          items: [{ key: 'it000001', name: 'Croquetas', allergens: ['milk'], soldOut: true }],
        },
      ],
    });
  });

  it('keeps sold out items and shows no allergens for a catalogue', () => {
    const shown = publicContent(content, 'CATALOGUE').categories[0]?.items[0];
    expect(shown).toEqual({ key: 'it000001', name: 'Croquetas', soldOut: true });
  });

  it('strips allergens when a menu becomes a catalogue', () => {
    expect(withoutAllergens(content).categories[0]?.items[0]).toEqual({
      key: 'it000001',
      name: 'Croquetas',
      soldOut: true,
    });
  });

  it('changes an item by its key and says when there is none', () => {
    expect(withItemFlags(content, 'nope0000', { hidden: true })).toBeNull();
    const shown = withItemFlags(content, 'it000002', { hidden: false, soldOut: true });
    expect(shown?.categories[0]?.items[1]).toEqual({
      key: 'it000002',
      name: 'Secreto',
      soldOut: true,
    });
    // The original is not touched.
    expect(content.categories[0]?.items[1]?.hidden).toBe(true);
  });
});

describe('requests', () => {
  it('needs the revision to change a menu, which may carry the content too', () => {
    expect(updateMenuSchema.safeParse({ title: 'Carta' }).success).toBe(false);
    expect(updateMenuSchema.safeParse({ revision: 1, title: 'Carta' }).success).toBe(true);
    expect(updateMenuSchema.safeParse({ revision: 1, content: {} }).success).toBe(true);
    expect(updateMenuSchema.safeParse({ revision: 1, other: 1 }).success).toBe(false);
  });

  it('lowercases and trims a slug (the service says whether it is usable)', () => {
    const parsed = createMenuSchema.parse({
      slug: '  Bar-Pepe ',
      kind: 'MENU',
      businessName: 'Bar Pepe',
      language: 'ES',
    });
    expect(parsed.slug).toBe('bar-pepe');
  });
});

describe('free plan limits and retention', () => {
  it('gives everyone the free limits (the owner’s decision)', () => {
    expect(menuLimits({ id: 'any' })).toEqual({
      menus: 1,
      categories: 20,
      itemsPerCategory: 60,
      showBadge: true,
    });
  });

  it('keeps reports for 12 months', () => {
    expect(reportsCutoff(new Date('2026-11-19T10:00:00Z')).toISOString()).toBe(
      '2025-11-19T10:00:00.000Z',
    );
  });
});

describe('QR', () => {
  it('draws an SVG with a title, a quiet zone of 4 and crisp edges', async () => {
    const svg = await menuQrSvg('https://menu.codeqlick.com/bar-pepe', 'QR of <Bar & Pepe>');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).toContain('<title>QR of &lt;Bar &amp; Pepe&gt;</title>');
    expect(svg).toContain('role="img"');
    expect(svg).toMatch(/<path stroke="#000000"/);
    // Quiet zone: the first dark module is 4 modules from the corner.
    expect(svg).toMatch(/d="M4 4\.5h/);
  });
});
