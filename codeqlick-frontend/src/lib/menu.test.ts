import { describe, expect, it } from 'vitest';
import en from '../messages/en.json';
import es from '../messages/es.json';
import {
  allergenText,
  buildMenuLabels,
  contentForApi,
  contentIssueCount,
  defaultTitle,
  formatMenuPrice,
  isValidMenuSlug,
  issueKind,
  mapIssuePaths,
  MENU_ALLERGENS,
  moveItem,
  normalizeSlugInput,
  shortLink,
  suggestSlug,
  visibleCategories,
} from './menu';

/** The nbsp and narrow nbsp Intl puts before a currency sign, as plain spaces for readability. */
const plain = (text: string) => text.replace(/[  ]/g, ' ');

describe('formatMenuPrice', () => {
  it('writes a plain number for the language, with the currency', () => {
    expect(plain(formatMenuPrice('12,50', 'EUR', 'ES'))).toBe('12,50 €');
    expect(formatMenuPrice('12.5', 'EUR', 'EN')).toBe('€12.50');
    expect(plain(formatMenuPrice('12', 'EUR', 'ES'))).toBe('12 €');
    expect(formatMenuPrice('9', 'GBP', 'EN')).toBe('£9');
  });

  it('shows any other text exactly as typed', () => {
    expect(formatMenuPrice('desde 9', 'EUR', 'ES')).toBe('desde 9');
    expect(formatMenuPrice('Market price', 'USD', 'EN')).toBe('Market price');
    expect(formatMenuPrice('12 €', 'EUR', 'ES')).toBe('12 €');
  });

  it('gives nothing for no price', () => {
    expect(formatMenuPrice(undefined, 'EUR', 'EN')).toBe('');
    expect(formatMenuPrice('  ', 'EUR', 'EN')).toBe('');
  });
});

describe('allergenText', () => {
  const names = Object.fromEntries(MENU_ALLERGENS.map((a) => [a, en.Menu.allergens[a]])) as Record<
    (typeof MENU_ALLERGENS)[number],
    string
  >;

  it('lists the allergens in words, in the regulation order', () => {
    expect(allergenText(['milk', 'gluten'], names, 'Contains:', 'en')).toBe(
      'Contains: gluten, milk',
    );
  });

  it('says nothing for none: the page never claims "allergen-free"', () => {
    expect(allergenText([], names, 'Contains:', 'en')).toBe('');
    expect(allergenText(undefined, names, 'Contains:', 'en')).toBe('');
  });

  it('ignores what is not an allergen', () => {
    expect(allergenText(['gluten', 'unicorn'], names, 'Contains:', 'en')).toBe('Contains: gluten');
  });
});

describe('the words of the page', () => {
  it('exist in English and Spanish, with the allergen note for the law', () => {
    for (const messages of [en, es]) {
      const labels = buildMenuLabels((key) => {
        const value = key
          .split('.')
          .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], messages.Menu);
        expect(typeof value, key).toBe('string');
        return value as string;
      });
      expect(labels.allergenNote.length).toBeGreaterThan(10);
      expect(Object.keys(labels.allergens)).toHaveLength(14);
    }
    expect(es.Menu.view.allergenNote).toBe('Si tienes alguna alergia o intolerancia, pregúntanos.');
  });

  it('has every key of one language in the other', () => {
    const keys = (node: unknown, prefix = ''): string[] =>
      typeof node === 'object' && node
        ? Object.entries(node).flatMap(([key, value]) => keys(value, `${prefix}${key}.`))
        : [prefix];
    expect(keys(es.Menu)).toEqual(keys(en.Menu));
    expect(keys(es.Admin.menus)).toEqual(keys(en.Admin.menus));
  });
});

describe('slugs', () => {
  it('normalises what is typed', () => {
    expect(normalizeSlugInput('Café Ñam')).toBe('cafe-nam');
    expect(normalizeSlugInput('mi  bar__2')).toBe('mi-bar-2');
    expect(normalizeSlugInput('a/b?c')).toBe('abc');
    expect(normalizeSlugInput('x'.repeat(60))).toHaveLength(40);
  });

  it('suggests a link from the name, without dashes at the ends', () => {
    expect(suggestSlug('  Bar El Rincón! ')).toBe('bar-el-rincon');
    expect(suggestSlug('¡¡¡')).toBe('');
  });

  it('checks the rules: 3-40 characters, lowercase, digits, single dashes', () => {
    expect(isValidMenuSlug('mi-bar')).toBe(true);
    expect(isValidMenuSlug('ab')).toBe(false);
    expect(isValidMenuSlug('Mi-bar')).toBe(false);
    expect(isValidMenuSlug('mi--bar')).toBe(false);
    expect(isValidMenuSlug('-mi-bar')).toBe(false);
    expect(isValidMenuSlug('a'.repeat(41))).toBe(false);
  });

  it('writes the short link without a double slash', () => {
    expect(shortLink('https://menu.codeqlick.com/', 'mi-bar')).toBe(
      'https://menu.codeqlick.com/mi-bar',
    );
  });

  it('suggests the default title by kind and language', () => {
    expect(defaultTitle('MENU', 'ES')).toBe('Carta');
    expect(defaultTitle('CATALOGUE', 'EN')).toBe('Catalogue');
  });
});

describe('the API errors by field', () => {
  it('maps content paths to the rows the editor shows', () => {
    expect(
      mapIssuePaths([
        { path: 'content.categories.0.items.1.name', message: 'Required' },
        { path: 'content.categories.2.name', message: 'Too long' },
        { path: 'slug', message: 'That link is reserved' },
        { path: 'content.categories.0.items.1.name', message: 'second one is ignored' },
        { path: '', message: 'Something' },
      ]),
    ).toEqual({
      'categories.0.items.1.name': 'Required',
      'categories.2.name': 'Too long',
      slug: 'That link is reserved',
      _form: 'Something',
    });
  });

  it('counts only the content problems', () => {
    expect(
      contentIssueCount({ slug: 'x', 'categories.0.name': 'y', 'categories.1.name': 'z' }),
    ).toBe(2);
  });

  it('classifies the messages so they can be said in the right language', () => {
    expect(issueKind('That link is reserved')).toBe('reserved');
    expect(issueKind('Links are not allowed')).toBe('links');
    expect(issueKind('Slug already taken')).toBe('taken');
    expect(issueKind('String must contain at most 80 characters')).toBe('tooLong');
    expect(issueKind('Too small: expected at least 1 character')).toBe('required');
    expect(issueKind('Invalid input')).toBe('invalid');
    expect(issueKind('Whatever')).toBe('other');
  });
});

describe('the content', () => {
  const content = {
    categories: [
      {
        key: 'aaaaaaaa',
        name: 'Starters',
        items: [
          { key: 'bbbbbbbb', name: 'Soup', hidden: true },
          { name: ' Bread ', price: ' 3 ', description: '  ', allergens: ['gluten' as const] },
        ],
      },
      { name: 'Empty', items: [{ name: 'Hidden', hidden: true }] },
    ],
  };

  it('leaves hidden items and empty categories out, as the page does', () => {
    const shown = visibleCategories(content);
    expect(shown).toHaveLength(1);
    expect(shown[0]?.items.map((item) => item.name)).toEqual([' Bread ']);
  });

  it('prepares it for the API: trimmed, no empty optionals, no keys never given', () => {
    const sent = contentForApi(content, 'MENU');
    expect(sent.categories[0]?.items[1]).toEqual({
      name: 'Bread',
      price: '3',
      allergens: ['gluten'],
    });
    expect(sent.categories[0]?.items[0]).toEqual({ key: 'bbbbbbbb', name: 'Soup', hidden: true });
  });

  it('drops allergens on a catalogue', () => {
    expect(contentForApi(content, 'CATALOGUE').categories[0]?.items[1]).toEqual({
      name: 'Bread',
      price: '3',
    });
  });

  it('moves items and ignores impossible moves', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 1, 2)).toEqual(['a', 'b']);
  });
});
