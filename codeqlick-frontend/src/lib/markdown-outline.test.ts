import { describe, expect, it } from 'vitest';
import { getOutline, slugify } from './markdown-outline';

describe('slugify', () => {
  it('lower-cases, drops accents and collapses everything else to one dash', () => {
    expect(slugify('Cómo   trabajamos: paso a paso!')).toBe('como-trabajamos-paso-a-paso');
    expect(slugify('  ¿Qué es Next.js 16?  ')).toBe('que-es-next-js-16');
    expect(slugify('Diseño y señales')).toBe('diseno-y-senales');
    expect(slugify('Über naïve café')).toBe('uber-naive-cafe');
  });

  it('falls back to "section" when nothing is left', () => {
    expect(slugify('')).toBe('section');
    expect(slugify('¿¡!?')).toBe('section');
    expect(slugify('🚀')).toBe('section');
  });
});

describe('getOutline', () => {
  it('nests each ### under the ## before it, with plain-text titles', () => {
    const outline = getOutline(
      [
        '# Title',
        '## The *first* part',
        '### Using `npm ci`',
        '### A [link](https://example.com) inside',
        '## Second',
        '#### Too deep',
        '## Third',
      ].join('\n\n'),
    );
    expect(outline).toEqual([
      {
        id: 'the-first-part',
        text: 'The first part',
        children: [
          { id: 'using-npm-ci', text: 'Using npm ci' },
          { id: 'a-link-inside', text: 'A link inside' },
        ],
      },
      { id: 'second', text: 'Second', children: [] },
      { id: 'third', text: 'Third', children: [] },
    ]);
  });

  it('numbers repeated anchors in order of appearance, across ## and ###', () => {
    const outline = getOutline('## Notes\n\n### Notes\n\n## Notes\n\n## Notes 2\n\n## Notes');
    // "Notes 2" would be `notes-2`, already taken by the ###: ids stay unique.
    expect(outline.map((entry) => entry.id)).toEqual(['notes', 'notes-3', 'notes-2-2', 'notes-4']);
    expect(outline[0]!.children).toEqual([{ id: 'notes-2', text: 'Notes' }]);
  });

  it('skips a numbered anchor a later heading already has', () => {
    // The second "Notes" takes `notes-2`, so the heading "Notes 2" can't have it.
    const outline = getOutline('## Notes\n\n## Notes\n\n## Notes 2');
    expect(outline.map((entry) => entry.id)).toEqual(['notes', 'notes-2', 'notes-2-2']);
    expect(outline.map((entry) => entry.text)).toEqual(['Notes', 'Notes', 'Notes 2']);
  });

  it('numbers headings that fall back to "section" like any other', () => {
    const outline = getOutline('## 🚀\n\n## ¿?\n\n## Section');
    expect(outline.map((entry) => entry.id)).toEqual(['section', 'section-2', 'section-3']);
  });

  it('leaves raw HTML out of titles and anchors, and keeps ñ in the title only', () => {
    const outline = getOutline('## Diseño <b>web</b>\n\n## Año   nuevo');
    expect(outline).toEqual([
      { id: 'diseno-web', text: 'Diseño web', children: [] },
      { id: 'ano-nuevo', text: 'Año nuevo', children: [] },
    ]);
  });

  it('counts underlined (setext) headings as ## too', () => {
    expect(getOutline('Plan\n----\n\nText.')).toEqual([{ id: 'plan', text: 'Plan', children: [] }]);
  });

  it('leaves out a ### that comes before any ##, but keeps counting its anchor', () => {
    const outline = getOutline('### Intro\n\n## Intro\n\n### Detail');
    expect(outline).toEqual([
      { id: 'intro-2', text: 'Intro', children: [{ id: 'detail', text: 'Detail' }] },
    ]);
  });

  it('is empty for a text without ## headings', () => {
    expect(getOutline('Just a paragraph.\n\n# Only a title')).toEqual([]);
  });

  it('never reuses an id the page layout already has', () => {
    expect(getOutline('## Main\n\n## App main').map((entry) => entry.id)).toEqual([
      'main-2',
      'app-main-2',
    ]);
  });
});
