import { describe, expect, it } from 'vitest';
import type {
  AdminPortfolioItem,
  AdminPost,
  PortfolioSnapshot,
  PostSnapshot,
} from '@/lib/api/types';
import { hasChanges, portfolioRevisionDiff, postRevisionDiff } from './revisions';

const post: AdminPost = {
  id: 'p1',
  slug: 'shipping',
  status: 'PUBLISHED',
  publishedAt: '2026-11-01T10:00:00.000Z',
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-02T10:00:00.000Z',
  coverImageUrl: '/media/cover.webp',
  tagIds: ['t1', 't2'],
  translations: [
    { locale: 'en', title: 'Shipping', excerpt: 'Why', content: '## Small' },
    { locale: 'es', title: 'Publicar', excerpt: 'Por qué', content: '## Pequeño' },
  ],
};

const postSnapshot: PostSnapshot = {
  coverImageUrl: '/media/cover.webp',
  tagIds: ['t2', 't1'],
  translations: [
    { locale: 'es', title: 'Publicar', excerpt: 'Por qué', content: '## Pequeño' },
    { locale: 'en', title: 'Shipping', excerpt: 'Why', content: '## Small' },
  ],
};

const names: Record<string, string> = { t1: 'Next.js', t2: 'Design' };
const tagName = (id: string) => names[id] ?? 'Deleted tag';

describe('postRevisionDiff', () => {
  it('sees no change when only the order of tags and translations differs', () => {
    const diff = postRevisionDiff(postSnapshot, post, tagName);
    expect(hasChanges(diff)).toBe(false);
    expect(diff.languages.map((language) => language.locale)).toEqual(['en', 'es']);
  });

  it('marks the fields that differ, per language', () => {
    const snapshot: PostSnapshot = {
      ...postSnapshot,
      translations: [
        { locale: 'en', title: 'Shipping on Fridays', excerpt: 'Why', content: '## Small' },
      ],
    };
    const diff = postRevisionDiff(snapshot, post, tagName);
    const en = diff.languages.find((language) => language.locale === 'en')!;
    expect(en.rows.map((row) => [row.field, row.changed])).toEqual([
      ['postTitle', true],
      ['excerpt', false],
      ['content', false],
    ]);
    expect(en.rows[0]).toMatchObject({ revision: 'Shipping on Fridays', current: 'Shipping' });
    // Spanish exists only now: every field changed, empty in the revision.
    const es = diff.languages.find((language) => language.locale === 'es')!;
    expect(es.rows.every((row) => row.changed && row.revision === '')).toBe(true);
    expect(hasChanges(diff)).toBe(true);
  });

  it('names tags and the cover image, and marks them when they differ', () => {
    const snapshot: PostSnapshot = { ...postSnapshot, coverImageUrl: null, tagIds: ['t1', 'gone'] };
    const diff = postRevisionDiff(snapshot, post, tagName);
    const [cover, tags] = diff.shared;
    expect(cover).toMatchObject({ kind: 'image', revision: '', changed: true });
    expect(tags).toMatchObject({
      kind: 'list',
      revision: ['Next.js', 'Deleted tag'],
      current: ['Next.js', 'Design'],
      changed: true,
    });
  });
});

const item: AdminPortfolioItem = {
  id: 'c1',
  slug: 'dashboard',
  status: 'DRAFT',
  publishedAt: null,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-02T10:00:00.000Z',
  sortOrder: 0,
  clientName: 'Acme',
  projectUrl: null,
  coverImageUrl: null,
  technologies: ['Next.js', 'NestJS'],
  services: ['web', 'design'],
  testimonialAuthor: null,
  translations: [{ locale: 'en', title: 'Dashboard', summary: 'Fast', content: 'Text' }],
};

const itemSnapshot: PortfolioSnapshot = {
  coverImageUrl: null,
  clientName: 'Acme',
  projectUrl: null,
  technologies: ['Next.js', 'NestJS'],
  services: ['web', 'design'],
  testimonialAuthor: null,
  translations: [
    {
      locale: 'en',
      title: 'Dashboard',
      summary: 'Fast',
      content: 'Text',
      testimonialQuote: null,
      testimonialRole: null,
    },
  ],
};

describe('portfolioRevisionDiff', () => {
  const serviceName = (key: string) => key.toUpperCase();

  it('treats a missing testimonial and a null one as the same', () => {
    expect(hasChanges(portfolioRevisionDiff(itemSnapshot, item, serviceName))).toBe(false);
  });

  it("compares the case study's own fields and names its services", () => {
    const snapshot: PortfolioSnapshot = {
      ...itemSnapshot,
      clientName: 'Acme Ltd',
      technologies: ['Next.js'],
      testimonialAuthor: 'Ana',
    };
    const diff = portfolioRevisionDiff(snapshot, item, serviceName);
    const changed = diff.shared.filter((row) => row.changed).map((row) => row.field);
    expect(changed).toEqual(['clientName', 'technologies', 'testimonialAuthor']);
    expect(diff.shared.find((row) => row.field === 'services')).toMatchObject({
      revision: ['WEB', 'DESIGN'],
      changed: false,
    });
    expect(diff.languages[0]!.rows.map((row) => row.field)).toEqual([
      'itemTitle',
      'summary',
      'content',
      'testimonialQuote',
      'testimonialRole',
    ]);
  });
});
