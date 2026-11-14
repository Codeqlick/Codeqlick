import { describe, expect, it } from 'vitest';
import {
  EMPTY_NEWS_FORM,
  NEWS_LIMITS,
  expiryDay,
  madridDay,
  newsChanged,
  newsFieldOf,
  newsPayload,
  newsProblems,
  type NewsForm,
} from './news';

const form: NewsForm = {
  title: 'Winter offer',
  summary: 'Two for one',
  body: 'Come in.',
  photo: '',
  expiresAt: '',
};

describe('the news section’s helpers', () => {
  it('gives the day it is in Madrid, not in UTC', () => {
    // 23:30 UTC on 14 July is already 15 July in Madrid (UTC+2); in winter it is UTC+1.
    expect(madridDay(new Date('2026-07-14T23:30:00Z'))).toBe('2026-07-15');
    expect(madridDay(new Date('2026-11-14T22:59:59Z'))).toBe('2026-11-14');
    expect(madridDay(new Date('2026-11-14T23:00:00Z'))).toBe('2026-11-15');
  });

  it('reads the Madrid day of an expiry, the end of that day', () => {
    expect(expiryDay('2026-07-14T21:59:59.999Z')).toBe('2026-07-14');
    expect(expiryDay('2026-11-14T22:59:59.999Z')).toBe('2026-11-14');
    expect(expiryDay(null)).toBe('');
  });

  it('asks for a title, a summary and a text', () => {
    expect(newsProblems(EMPTY_NEWS_FORM, '2026-11-14')).toEqual({
      title: 'required',
      summary: 'required',
      body: 'required',
    });
    expect(newsProblems({ ...form, title: '   ' }, '2026-11-14')).toEqual({ title: 'required' });
    expect(newsProblems(form, '2026-11-14')).toEqual({});
  });

  it('checks the lengths of the API', () => {
    const problems = newsProblems(
      {
        ...form,
        title: 'x'.repeat(NEWS_LIMITS.title + 1),
        summary: 'x'.repeat(NEWS_LIMITS.summary + 1),
        body: 'x'.repeat(NEWS_LIMITS.body + 1),
      },
      '2026-11-14',
    );
    expect(problems).toEqual({ title: 'tooLong', summary: 'tooLong', body: 'tooLong' });
    expect(newsProblems({ ...form, title: 'x'.repeat(NEWS_LIMITS.title) }, '2026-11-14')).toEqual(
      {},
    );
  });

  it('accepts today or later as the last day, and nothing in the past', () => {
    expect(newsProblems({ ...form, expiresAt: '2026-11-14' }, '2026-11-14')).toEqual({});
    expect(newsProblems({ ...form, expiresAt: '2026-12-01' }, '2026-11-14')).toEqual({});
    // Saving a past day is allowed; publishing is not.
    expect(newsProblems({ ...form, expiresAt: '2026-11-13' }, '2026-11-14')).toEqual({});
    expect(newsProblems({ ...form, expiresAt: '2026-11-13' }, '2026-11-14', true)).toEqual({
      expiresAt: 'past',
    });
    expect(newsProblems({ ...form, expiresAt: '14/11/2026' }, '2026-11-14')).toEqual({
      expiresAt: 'date',
    });
  });

  it('builds the body of a save: trimmed, null to remove the photo and the expiry', () => {
    expect(newsPayload({ ...form, title: '  Winter offer ', body: 'Come in.\n' })).toEqual({
      title: 'Winter offer',
      summary: 'Two for one',
      body: 'Come in.',
      photo: null,
      expiresAt: null,
    });
    expect(newsPayload({ ...form, photo: 'media/a.jpg', expiresAt: '2026-12-01' })).toMatchObject({
      photo: 'media/a.jpg',
      expiresAt: '2026-12-01',
    });
  });

  it('notices a changed form', () => {
    expect(newsChanged(form, { ...form })).toBe(false);
    expect(newsChanged(form, { ...form, body: 'Come in!' })).toBe(true);
    expect(newsChanged(form, { ...form, expiresAt: '2026-12-01' })).toBe(true);
  });

  it('finds the field an API issue is about', () => {
    expect(newsFieldOf('title')).toBe('title');
    expect(newsFieldOf('expiresAt')).toBe('expiresAt');
    expect(newsFieldOf('_form', 'photo must be one of the site’s uploads')).toBe('photo');
    expect(newsFieldOf('_form', 'Something else')).toBeNull();
  });
});
