import { describe, expect, it } from 'vitest';
import {
  createNewsSchema,
  disallowedLinks,
  endOfMadridDay,
  madridDayOf,
  newsStatus,
  slugOf,
  toBuildPost,
  uniqueSlug,
  updateNewsSchema,
} from './site-news.js';

const valid = { title: 'Menú de Navidad', summary: 'Reserva ya.', body: 'Hola' };

describe('news slugs', () => {
  it('makes an address from the title', () => {
    expect(slugOf('Menú de Navidad: ¡reserva ya!')).toBe('menu-de-navidad-reserva-ya');
    expect(slugOf('  Ñandú  &  Co. ')).toBe('nandu-co');
  });

  it('keeps it to 60 characters without a trailing dash', () => {
    const slug = slugOf(`${'a'.repeat(59)} bbbb`);
    expect(slug).toHaveLength(59);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('gives a title with nothing usable a word, and a digits-only one a suffix', () => {
    expect(slugOf('¡¡¡')).toBe('noticia');
    expect(slugOf('2')).toBe('2-noticia');
    expect(slugOf('2024')).toBe('2024-noticia');
    expect(slugOf('Oferta 2024')).toBe('oferta-2024');
  });

  it('adds a number when the address is taken', () => {
    expect(uniqueSlug('oferta', new Set())).toBe('oferta');
    expect(uniqueSlug('oferta', new Set(['oferta']))).toBe('oferta-2');
    expect(uniqueSlug('oferta', new Set(['oferta', 'oferta-2', 'oferta-3']))).toBe('oferta-4');
  });
});

describe('news bodies', () => {
  it('lets links through only with http, https, mailto or tel', () => {
    const body = '[a](https://x.es) [b](http://x.es) [c](mailto:a@x.es) [d](TEL:+34600000000)';
    expect(disallowedLinks(body)).toEqual([]);
  });

  it('finds the other schemes and the ones without any', () => {
    const body = '[a](javascript:alert(1) [b](data:text/html,x) [c](/privado) [d](www.x.es) [e]()';
    expect(disallowedLinks(body)).toHaveLength(5);
    expect(disallowedLinks('[x]( javascript:alert(1))')).toEqual(['javascript:alert(1']);
  });

  it('refuses a post with a bad link and accepts one with a good link', () => {
    expect(createNewsSchema.safeParse({ ...valid, body: '[x](ftp://a.es)' }).success).toBe(false);
    expect(
      createNewsSchema.safeParse({ ...valid, body: '**Hola** [x](https://a.es)' }).success,
    ).toBe(true);
  });
});

describe('news validation', () => {
  it('limits the lengths', () => {
    expect(createNewsSchema.safeParse(valid).success).toBe(true);
    expect(createNewsSchema.safeParse({ ...valid, title: 'x'.repeat(121) }).success).toBe(false);
    expect(createNewsSchema.safeParse({ ...valid, summary: 'x'.repeat(301) }).success).toBe(false);
    expect(createNewsSchema.safeParse({ ...valid, body: 'x'.repeat(10_001) }).success).toBe(false);
    expect(createNewsSchema.safeParse({ ...valid, title: '   ' }).success).toBe(false);
  });

  it('takes a photo of the uploads, a date for the expiry, and nothing else', () => {
    const file = 'media/0f8b2c1e-1234-4abc-8def-0123456789ab.jpg';
    expect(
      createNewsSchema.safeParse({ ...valid, photo: file, expiresAt: '2026-12-24' }).success,
    ).toBe(true);
    expect(createNewsSchema.safeParse({ ...valid, photo: 'hero.jpg' }).success).toBe(false);
    expect(createNewsSchema.safeParse({ ...valid, photo: 'media/../x.jpg' }).success).toBe(false);
    expect(createNewsSchema.safeParse({ ...valid, expiresAt: '24/12/2026' }).success).toBe(false);
    expect(createNewsSchema.safeParse({ ...valid, slug: 'otro' }).success).toBe(false);
  });

  it('makes every field optional on update and lets photo and expiry be removed', () => {
    expect(updateNewsSchema.safeParse({}).success).toBe(true);
    expect(updateNewsSchema.safeParse({ photo: null, expiresAt: null }).success).toBe(true);
    expect(updateNewsSchema.safeParse({ body: '[x](javascript:y)' }).success).toBe(false);
    expect(updateNewsSchema.safeParse({ slug: 'otro' }).success).toBe(false);
  });
});

describe('news dates', () => {
  it('shows an offer through its Madrid day', () => {
    expect(endOfMadridDay('2026-12-24').toISOString()).toBe('2026-12-24T22:59:59.999Z');
    expect(endOfMadridDay('2026-07-01').toISOString()).toBe('2026-07-01T21:59:59.999Z');
    expect(madridDayOf(endOfMadridDay('2026-12-31'))).toBe('2026-12-31');
  });

  it('derives the state from the dates', () => {
    const now = new Date('2026-11-14T10:00:00Z');
    const past = new Date('2026-11-13T22:59:59.999Z');
    const future = new Date('2026-11-14T22:59:59.999Z');
    expect(newsStatus({ publishedAt: null, expiresAt: past }, now)).toBe('DRAFT');
    expect(newsStatus({ publishedAt: now, expiresAt: null }, now)).toBe('PUBLISHED');
    expect(newsStatus({ publishedAt: now, expiresAt: future }, now)).toBe('PUBLISHED');
    expect(newsStatus({ publishedAt: now, expiresAt: past }, now)).toBe('EXPIRED');
  });
});

describe('the post a build gets', () => {
  const row = {
    id: 'id',
    siteId: 's',
    slug: 'oferta',
    title: 'Oferta',
    summary: 'Resumen',
    body: 'Texto',
    photo: 'media/0f8b2c1e-1234-4abc-8def-0123456789ab.jpg',
    publishedAt: new Date('2026-11-01T10:00:00Z'),
    expiresAt: new Date('2026-12-24T22:59:59.999Z'),
    authorId: null,
    createdAt: new Date('2026-10-30T10:00:00Z'),
    updatedAt: new Date('2026-11-02T10:00:00Z'),
  };

  it('carries the text, the photo as a content image and the dates', () => {
    expect(toBuildPost(row)).toEqual({
      slug: 'oferta',
      title: 'Oferta',
      summary: 'Resumen',
      body: 'Texto',
      photo: { file: row.photo, alt: 'Oferta' },
      publishedAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-02T10:00:00.000Z',
      expiresAt: '2026-12-24T22:59:59.999Z',
    });
  });

  it('leaves out the photo and the expiry when there are none, and never sends a draft', () => {
    const plain = toBuildPost({ ...row, photo: null, expiresAt: null });
    expect(plain).not.toHaveProperty('photo');
    expect(plain).not.toHaveProperty('expiresAt');
    expect(toBuildPost({ ...row, publishedAt: null })).toBeUndefined();
  });
});
