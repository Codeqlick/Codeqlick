import { describe, expect, it } from 'vitest';
import {
  canDeleteComment,
  commentStatus,
  isCommentPath,
  parseCorsForm,
  viewportHint,
  withMention,
} from './cloud';

const form = (overrides: Partial<Parameters<typeof parseCorsForm>[0]> = {}) => ({
  origins: 'https://example.com',
  methods: ['GET', 'HEAD'],
  headers: '',
  exposeHeaders: '',
  maxAge: '',
  ...overrides,
});

describe('parseCorsForm', () => {
  it('takes origins one per line, lowercased and once, and leaves empty fields to the API', () => {
    expect(
      parseCorsForm(
        form({
          origins:
            'https://Example.com\n\n  http://localhost:5173 \nhttps://example.com\nhttps://*.example.com',
        }),
      ),
    ).toEqual({
      ok: true,
      value: {
        origins: ['https://example.com', 'http://localhost:5173', 'https://*.example.com'],
        methods: ['GET', 'HEAD'],
      },
    });
  });

  it('accepts * and sends headers, exposed headers and max age when given', () => {
    expect(
      parseCorsForm(
        form({
          origins: '*',
          methods: ['PUT', 'GET', 'BOGUS'],
          headers: 'Content-Type, x-amz-*',
          exposeHeaders: 'ETag,  ',
          maxAge: '600',
        }),
      ),
    ).toEqual({ ok: false, errors: { headers: 'headersInvalid' } });
    expect(
      parseCorsForm(
        form({
          origins: '*',
          methods: ['PUT', 'GET'],
          headers: 'Content-Type, *',
          exposeHeaders: 'ETag',
          maxAge: '600',
        }),
      ),
    ).toEqual({
      ok: true,
      value: {
        origins: ['*'],
        methods: ['GET', 'PUT'],
        headers: ['Content-Type', '*'],
        exposeHeaders: ['ETag'],
        maxAge: 600,
      },
    });
  });

  it('refuses no origins, more than 10, or ones with a path or another scheme', () => {
    expect(parseCorsForm(form({ origins: ' \n ' }))).toMatchObject({
      errors: { origins: 'originsRequired' },
    });
    const eleven = Array.from({ length: 11 }, (_, i) => `https://s${i}.example.com`).join('\n');
    expect(parseCorsForm(form({ origins: eleven }))).toMatchObject({
      errors: { origins: 'originsTooMany' },
    });
    for (const origin of ['https://example.com/app', 'ftp://example.com', 'example.com']) {
      expect(parseCorsForm(form({ origins: origin }))).toMatchObject({
        errors: { origins: 'originInvalid' },
      });
    }
  });

  it('needs a method and a max age from 0 to 86,400 whole seconds', () => {
    const result = parseCorsForm(form({ methods: [], maxAge: '86401' }));
    expect(result).toEqual({
      ok: false,
      errors: { methods: 'methodsRequired', maxAge: 'maxAgeRange' },
    });
    expect(parseCorsForm(form({ maxAge: '1.5' }))).toMatchObject({
      errors: { maxAge: 'maxAgeRange' },
    });
    expect(parseCorsForm(form({ maxAge: '0' }))).toMatchObject({ ok: true, value: { maxAge: 0 } });
  });

  it('allows at most 20 headers', () => {
    const many = Array.from({ length: 21 }, (_, i) => `X-H${i}`).join(',');
    expect(parseCorsForm(form({ exposeHeaders: many }))).toMatchObject({
      errors: { exposeHeaders: 'headersTooMany' },
    });
  });
});

describe('viewportHint', () => {
  it('calls frames narrower than 768 px mobile', () => {
    expect(viewportHint(390)).toBe('mobile');
    expect(viewportHint(767)).toBe('mobile');
    expect(viewportHint(768)).toBe('desktop');
    expect(viewportHint(1440)).toBe('desktop');
    expect(viewportHint(null)).toBeNull();
  });
});

describe('comments helpers', () => {
  it('reads the status filter, open by default', () => {
    expect(commentStatus('resolved')).toBe('resolved');
    expect(commentStatus('all')).toBe('all');
    expect(commentStatus(undefined)).toBe('open');
    expect(commentStatus('nope')).toBe('open');
  });

  it('lets the author or an admin delete a comment', () => {
    expect(canDeleteComment('u1', 'u1', false)).toBe(true);
    expect(canDeleteComment('u2', 'u1', false)).toBe(false);
    expect(canDeleteComment('u2', 'u1', true)).toBe(true);
    // A deleted account's comment (no author id) is an admin's to delete.
    expect(canDeleteComment(null, null, false)).toBe(false);
  });

  it('accepts same-host page paths only', () => {
    expect(isCommentPath('/')).toBe(true);
    expect(isCommentPath('/pricing?plan=pro')).toBe(true);
    expect(isCommentPath('//evil.example')).toBe(false);
    expect(isCommentPath('https://evil.example/')).toBe(false);
    expect(isCommentPath('/a b')).toBe(false);
    expect(isCommentPath(`/${'a'.repeat(1000)}`)).toBe(false);
  });

  it('adds a mention once, after a space', () => {
    expect(withMention('', 'Ana')).toBe('@Ana ');
    expect(withMention('Look', 'Ana')).toBe('Look @Ana ');
    expect(withMention('Look ', 'Ana')).toBe('Look @Ana ');
    expect(withMention('Look @Ana here', 'Ana')).toBe('Look @Ana here');
  });
});
