import { describe, expect, it, vi } from 'vitest';
import { Locale } from '../../generated/prisma/client.js';
import type { SearchRepository } from './search.repository.js';
import { adminSearchQuerySchema } from './search.schemas.js';
import { SEARCH_LIMIT, SearchService, searchNumber } from './search.service.js';

const KINDS = [
  'leads',
  'users',
  'projects',
  'tickets',
  'proposals',
  'posts',
  'caseStudies',
] as const;
type Rows = Partial<Record<(typeof KINDS)[number], unknown[]>>;

function makeService(rows: Rows = {}) {
  const repo = Object.fromEntries(
    KINDS.map((kind) => [kind, vi.fn().mockResolvedValue(rows[kind] ?? [])]),
  ) as unknown as Record<(typeof KINDS)[number], ReturnType<typeof vi.fn>>;
  return { repo, service: new SearchService(repo as unknown as SearchRepository) };
}

describe('adminSearchQuerySchema', () => {
  const parse = (query: Record<string, unknown>) => adminSearchQuerySchema.safeParse(query);

  it('trims q and defaults the locale to English', () => {
    const result = parse({ q: '  ana  ' });
    expect(result.success && result.data).toEqual({ q: 'ana', locale: 'en' });
  });

  it('refuses a missing q, one character, or only spaces', () => {
    expect(parse({}).success).toBe(false);
    expect(parse({ q: 'a' }).success).toBe(false);
    expect(parse({ q: ' a ' }).success).toBe(false);
    expect(parse({ q: '     ' }).success).toBe(false);
  });

  it('accepts 2 and 100 characters, refuses 101', () => {
    expect(parse({ q: 'ab' }).success).toBe(true);
    expect(parse({ q: 'x'.repeat(100) }).success).toBe(true);
    expect(parse({ q: 'x'.repeat(101) }).success).toBe(false);
  });

  it('accepts en and es only', () => {
    expect(parse({ q: 'ab', locale: 'es' }).success).toBe(true);
    expect(parse({ q: 'ab', locale: 'fr' }).success).toBe(false);
  });
});

describe('searchNumber', () => {
  it('reads 12 and #12 as the number 12', () => {
    expect(searchNumber('12')).toBe(12);
    expect(searchNumber('#12')).toBe(12);
    expect(searchNumber('#007')).toBe(7);
  });

  it('is not a number otherwise', () => {
    expect(searchNumber('12a')).toBeUndefined();
    expect(searchNumber('##12')).toBeUndefined();
    expect(searchNumber('# 12')).toBeUndefined();
    expect(searchNumber('-12')).toBeUndefined();
    expect(searchNumber('1234567890')).toBeUndefined(); // 10 digits
    expect(searchNumber('123456789')).toBe(123456789);
  });
});

describe('SearchService.search', () => {
  it('passes the trimmed text, the limit and the number to every query', async () => {
    const { repo, service } = makeService();
    await service.search(' #12 ', 'en');
    for (const kind of KINDS) {
      expect(repo[kind]).toHaveBeenCalledWith({ q: '#12', number: 12, take: SEARCH_LIMIT });
    }
    expect(SEARCH_LIMIT).toBe(5);
  });

  it('passes no number for text', async () => {
    const { repo, service } = makeService();
    await service.search('ana', 'en');
    expect(repo.tickets).toHaveBeenCalledWith({ q: 'ana', number: undefined, take: 5 });
  });

  it('finds requests and proposals by number, with #number · client as sublabel', async () => {
    const client = { name: 'Bar Pepe' };
    const { service } = makeService({
      tickets: [{ id: 't1', number: 12, title: 'Broken form', client }],
      proposals: [{ id: 'p1', number: 12, title: 'New shop', client }],
    });
    const result = await service.search('#12', 'en');
    expect(result).toEqual({
      q: '#12',
      groups: [
        { kind: 'ticket', items: [{ id: 't1', label: 'Broken form', sublabel: '#12 · Bar Pepe' }] },
        { kind: 'proposal', items: [{ id: 'p1', label: 'New shop', sublabel: '#12 · Bar Pepe' }] },
      ],
    });
  });

  it('returns only kinds with matches, always in the fixed order', async () => {
    const { service } = makeService({
      caseStudies: [{ id: 'c1', slug: 'bar-pepe', clientName: null, translations: [] }],
      users: [{ id: 'u1', name: 'Ana', email: 'ana@example.com' }],
      leads: [{ id: 'l1', name: 'Ana', email: null, company: null }],
      projects: [{ id: 'pr1', name: 'Shop', client: { name: 'Ana' } }],
    });
    const result = await service.search('ana', 'en');
    expect(result.groups.map((group) => group.kind)).toEqual([
      'lead',
      'user',
      'project',
      'caseStudy',
    ]);
  });

  it('returns no groups when nothing matches', async () => {
    const { service } = makeService();
    expect(await service.search('zz', 'es')).toEqual({ q: 'zz', groups: [] });
  });

  it('labels leads with company · email, whichever exist, or null', async () => {
    const { service } = makeService({
      leads: [
        { id: 'l1', name: 'Ana', email: 'ana@example.com', company: 'Acme' },
        { id: 'l2', name: 'Bea', email: 'bea@example.com', company: null },
        { id: 'l3', name: 'Carla', email: null, company: 'Taller' },
        { id: 'l4', name: 'Dani', email: null, company: null },
      ],
    });
    const [leads] = (await service.search('an', 'en')).groups;
    expect(leads!.items.map((item) => item.sublabel)).toEqual([
      'Acme · ana@example.com',
      'bea@example.com',
      'Taller',
      null,
    ]);
  });

  it('titles posts and case studies in the locale, else English, else the slug', async () => {
    const both = [
      { locale: Locale.EN, title: 'Choosing versions' },
      { locale: Locale.ES, title: 'Cómo elegimos versiones' },
    ];
    const english = [{ locale: Locale.EN, title: 'Only English' }];
    const { service } = makeService({
      posts: [
        { id: 'p1', slug: 'versions', translations: both },
        { id: 'p2', slug: 'english', translations: english },
        { id: 'p3', slug: 'empty', translations: [] },
      ],
      caseStudies: [
        { id: 'c1', slug: 'acme', clientName: 'Acme', translations: both },
        { id: 'c2', slug: 'no-client', clientName: null, translations: english },
      ],
    });

    const es = await service.search('ver', 'es');
    expect(es.groups).toEqual([
      {
        kind: 'post',
        items: [
          { id: 'p1', label: 'Cómo elegimos versiones', sublabel: 'versions' },
          { id: 'p2', label: 'Only English', sublabel: 'english' },
          { id: 'p3', label: 'empty', sublabel: 'empty' },
        ],
      },
      {
        kind: 'caseStudy',
        items: [
          { id: 'c1', label: 'Cómo elegimos versiones', sublabel: 'Acme' },
          { id: 'c2', label: 'Only English', sublabel: 'no-client' },
        ],
      },
    ]);

    const en = await service.search('ver', 'en');
    expect(en.groups[0]!.items[0]!.label).toBe('Choosing versions');
  });

  it('labels users with their email and projects with their client', async () => {
    const { service } = makeService({
      users: [{ id: 'u1', name: 'Ana', email: 'ana@example.com' }],
      projects: [{ id: 'pr1', name: 'Shop', client: { name: 'Acme' } }],
    });
    const { groups } = await service.search('ana', 'en');
    expect(groups).toEqual([
      { kind: 'user', items: [{ id: 'u1', label: 'Ana', sublabel: 'ana@example.com' }] },
      { kind: 'project', items: [{ id: 'pr1', label: 'Shop', sublabel: 'Acme' }] },
    ]);
  });
});
