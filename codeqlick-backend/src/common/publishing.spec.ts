import { describe, expect, it } from 'vitest';
import { PublishStatus } from '../generated/prisma/client.js';
import { isScheduled, publishedAtOnCreate, publishedAtOnUpdate } from './publishing.js';

const { DRAFT, PUBLISHED } = PublishStatus;
const earlier = new Date('2026-01-01T09:00:00Z');

describe('publication dates', () => {
  it('publishes now, at a requested date, or not at all for a draft', () => {
    expect(publishedAtOnCreate(PUBLISHED, undefined)?.getTime()).toBeCloseTo(Date.now(), -3);
    expect(publishedAtOnCreate(PUBLISHED, '2030-05-01T08:00:00+02:00')?.toISOString()).toBe(
      '2030-05-01T06:00:00.000Z',
    );
    expect(publishedAtOnCreate(DRAFT, null)).toBeNull();
  });

  it('keeps the first publication date unless a new one is given', () => {
    const published = { status: PUBLISHED, publishedAt: earlier };
    expect(publishedAtOnUpdate(published, PUBLISHED, undefined)).toBeUndefined();
    expect(
      publishedAtOnUpdate({ status: DRAFT, publishedAt: null }, PUBLISHED, undefined),
    ).toBeInstanceOf(Date);
    expect(publishedAtOnUpdate(published, undefined, '2030-05-01T06:00:00Z')?.toISOString()).toBe(
      '2030-05-01T06:00:00.000Z',
    );
    // Clearing the date: now for published content, none for a draft.
    expect(publishedAtOnUpdate(published, undefined, null)).toBeInstanceOf(Date);
    expect(publishedAtOnUpdate(published, DRAFT, null)).toBeNull();
  });

  it('tells scheduled content from live content', () => {
    const now = new Date('2026-10-14T12:00:00Z');
    expect(
      isScheduled({ status: PUBLISHED, publishedAt: new Date('2026-10-15T00:00:00Z') }, now),
    ).toBe(true);
    expect(isScheduled({ status: PUBLISHED, publishedAt: earlier }, now)).toBe(false);
    expect(isScheduled({ status: DRAFT, publishedAt: new Date('2026-10-15T00:00:00Z') }, now)).toBe(
      false,
    );
  });
});
