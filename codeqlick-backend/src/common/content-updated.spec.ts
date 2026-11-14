import { describe, expect, it } from 'vitest';
import { Locale, PublishStatus } from '../generated/prisma/client.js';
import {
  contentUpdatedAtOnUpdate,
  publicContentUpdatedAt,
  readerContentChanged,
  type ReaderContent,
} from './content-updated.js';

const { DRAFT, PUBLISHED } = PublishStatus;
const now = new Date('2026-11-14T12:00:00Z');
const earlier = new Date('2026-11-01T09:00:00Z');

const en = { locale: Locale.EN, title: 'Hello', excerpt: 'Short', content: 'Body' };
const es = { locale: Locale.ES, title: 'Hola', excerpt: 'Corto', content: 'Cuerpo' };
const base: ReaderContent = { coverImageUrl: 'https://example.com/a.png', translations: [en, es] };

describe('readerContentChanged', () => {
  it('ignores a save with the same content, in any order', () => {
    expect(readerContentChanged(base, { ...base, translations: [es, { ...en }] })).toBe(false);
  });

  it('sees a change of title, excerpt, summary or body', () => {
    for (const change of [{ title: 'Hi' }, { excerpt: 'Shorter' }, { content: 'New body' }]) {
      expect(
        readerContentChanged(base, { ...base, translations: [{ ...en, ...change }, es] }),
      ).toBe(true);
    }
    const study = { locale: Locale.EN, title: 'Shop', summary: 'A shop', content: 'Body' };
    expect(
      readerContentChanged(
        { coverImageUrl: null, translations: [study] },
        { coverImageUrl: null, translations: [{ ...study, summary: 'An online shop' }] },
      ),
    ).toBe(true);
  });

  it('sees a translation added or removed and a new cover image', () => {
    expect(readerContentChanged(base, { ...base, translations: [en] })).toBe(true);
    expect(readerContentChanged({ ...base, translations: [en] }, base)).toBe(true);
    // Same count, different language.
    expect(
      readerContentChanged(
        { ...base, translations: [en] },
        { ...base, translations: [{ ...en, locale: Locale.ES }] },
      ),
    ).toBe(true);
    expect(readerContentChanged(base, { ...base, coverImageUrl: null })).toBe(true);
  });

  it('ignores fields readers do not see as content (a testimonial quote)', () => {
    const before = { ...base, translations: [{ ...en, testimonialQuote: 'Great' }] };
    const after = { ...base, translations: [{ ...en, testimonialQuote: 'Superb' }] };
    expect(readerContentChanged(before, after)).toBe(false);
  });
});

describe('contentUpdatedAtOnUpdate', () => {
  const live = { ...base, status: PUBLISHED, publishedAt: earlier };
  const edited = { ...base, status: PUBLISHED, translations: [{ ...en, title: 'Hi' }, es] };

  it('is now when a live item stays published and its content changed', () => {
    expect(contentUpdatedAtOnUpdate(live, edited, now)).toBe(now);
  });

  it('leaves it when nothing readers see changed', () => {
    expect(contentUpdatedAtOnUpdate(live, { ...base, status: PUBLISHED }, now)).toBeUndefined();
  });

  it('leaves it for drafts, scheduled items and unpublishing', () => {
    expect(
      contentUpdatedAtOnUpdate({ ...live, status: DRAFT, publishedAt: null }, edited, now),
    ).toBeUndefined();
    expect(
      contentUpdatedAtOnUpdate({ ...live, status: DRAFT, publishedAt: earlier }, edited, now),
    ).toBeUndefined();
    expect(
      contentUpdatedAtOnUpdate(
        { ...live, publishedAt: new Date('2026-12-01T00:00:00Z') },
        edited,
        now,
      ),
    ).toBeUndefined();
    expect(contentUpdatedAtOnUpdate(live, { ...edited, status: DRAFT }, now)).toBeUndefined();
  });
});

describe('publicContentUpdatedAt', () => {
  const publishedAt = new Date('2026-11-01T09:00:00Z');
  const createdAt = new Date('2026-10-30T09:00:00Z');

  it('is null without an update', () => {
    expect(publicContentUpdatedAt({ publishedAt, createdAt, contentUpdatedAt: null })).toBeNull();
  });

  it('is null for a fix within 24 hours of publication', () => {
    const contentUpdatedAt = new Date('2026-11-02T08:59:59.999Z');
    expect(publicContentUpdatedAt({ publishedAt, createdAt, contentUpdatedAt })).toBeNull();
  });

  it('gives the date from 24 hours after publication on', () => {
    const contentUpdatedAt = new Date('2026-11-02T09:00:00Z');
    expect(publicContentUpdatedAt({ publishedAt, createdAt, contentUpdatedAt })).toBe(
      '2026-11-02T09:00:00.000Z',
    );
  });

  it('measures from createdAt when there is no publication date', () => {
    const contentUpdatedAt = new Date('2026-10-31T10:00:00Z');
    expect(publicContentUpdatedAt({ publishedAt: null, createdAt, contentUpdatedAt })).toBe(
      '2026-10-31T10:00:00.000Z',
    );
  });
});
