import { describe, expect, it } from 'vitest';
import {
  KEEP_CONTENT_REVISIONS,
  revisionsToPrune,
  sameSnapshot,
  snapshotLocale,
  toContentRevision,
} from './content-revisions.js';

const en = { locale: 'en', title: 'Hello', excerpt: 'Hi', content: 'Body' };
const es = { locale: 'es', title: 'Hola', excerpt: 'Hola', content: 'Cuerpo' };

describe('content revisions', () => {
  it('compares tag ids and translations without regard to order', () => {
    const a = { coverImageUrl: null, tagIds: ['t1', 't2'], translations: [en, es] };
    const b = { translations: [es, en], tagIds: ['t2', 't1'], coverImageUrl: null };
    expect(sameSnapshot(a, b)).toBe(true);
  });

  it('sees a change in any field, nested or not', () => {
    const base = { coverImageUrl: null, tagIds: ['t1'], translations: [en, es] };
    expect(sameSnapshot(base, { ...base, coverImageUrl: 'https://x.test/a.png' })).toBe(false);
    expect(sameSnapshot(base, { ...base, tagIds: ['t1', 't2'] })).toBe(false);
    expect(sameSnapshot(base, { ...base, translations: [en] })).toBe(false);
    const edited = { ...es, content: 'Otro cuerpo' };
    expect(sameSnapshot(base, { ...base, translations: [en, edited] })).toBe(false);
  });

  it('keeps the order of other lists, such as technologies', () => {
    const a = { technologies: ['Next.js', 'NestJS'], translations: [] };
    const b = { technologies: ['NestJS', 'Next.js'], translations: [] };
    expect(sameSnapshot(a, b)).toBe(false);
  });

  it('prunes everything beyond the newest 20', () => {
    const rows = Array.from({ length: KEEP_CONTENT_REVISIONS + 2 }, (_, i) => ({ id: `r${i}` }));
    expect(revisionsToPrune(rows)).toEqual(['r20', 'r21']);
    expect(revisionsToPrune(rows.slice(0, KEEP_CONTENT_REVISIONS))).toEqual([]);
    expect(revisionsToPrune(rows.slice(0, 3), 1)).toEqual(['r1', 'r2']);
  });

  it('shapes a revision for the API', () => {
    const createdAt = new Date('2026-11-14T10:00:00Z');
    expect(toContentRevision({ id: 'r1', createdAt, author: null })).toEqual({
      id: 'r1',
      createdAt: '2026-11-14T10:00:00.000Z',
      author: null,
    });
    expect(snapshotLocale('ES')).toBe('es');
    expect(snapshotLocale('EN')).toBe('en');
  });
});
