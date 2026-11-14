import { describe, expect, it } from 'vitest';
import {
  contentHash,
  isProjectOrigin,
  madridMonth,
  pageOf,
  parseSubmission,
  staticSpamReason,
  toCsv,
} from './cloud-form-fields.js';

describe('parseSubmission', () => {
  it('keeps the fields and takes the instructions apart', () => {
    const result = parseSubmission({
      name: ' Ada ',
      email: 'ada@example.com',
      topics: ['a', 'b'],
      _redirect: 'https://docs.codeqlick.app/thanks',
      _subject: 'New   lead',
      _other: 'x',
      empty: '',
    });
    expect(result).toEqual({
      ok: true,
      value: {
        fields: { name: 'Ada', email: 'ada@example.com', topics: 'a, b' },
        email: 'ada@example.com',
        redirect: 'https://docs.codeqlick.app/thanks',
        subject: 'New lead',
        spam: false,
      },
    });
  });

  it('marks a filled honeypot as spam and ignores a bad email', () => {
    const result = parseSubmission({ message: 'hi', email: 'nope', _gotcha: 'bot' });
    expect(result.ok && result.value).toMatchObject({ spam: true, email: null });
  });

  it('refuses empty, too many and too long', () => {
    expect(parseSubmission({}).ok).toBe(false);
    expect(parseSubmission(null).ok).toBe(false);
    expect(parseSubmission({ a: 'x'.repeat(5001) }).ok).toBe(false);
    const many = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`f${i}`, 'v']));
    expect(parseSubmission(many).ok).toBe(false);
    expect(parseSubmission({ ['n'.repeat(61)]: 'v' }).ok).toBe(false);
  });
});

describe('isProjectOrigin', () => {
  const project = { slug: 'docs', hostingDomain: 'codeqlick.app', domains: ['docs.example.com'] };
  it('accepts production, deployments and domains over https', () => {
    expect(isProjectOrigin('https://docs.codeqlick.app', project)).toBe(true);
    expect(isProjectOrigin('https://docs--a1b2c3d4.codeqlick.app', project)).toBe(true);
    expect(isProjectOrigin('https://docs.example.com', project)).toBe(true);
  });
  it('refuses others', () => {
    expect(isProjectOrigin('https://other.codeqlick.app', project)).toBe(false);
    expect(isProjectOrigin('https://docs-evil.codeqlick.app', project)).toBe(false);
    expect(isProjectOrigin('http://docs.codeqlick.app', project)).toBe(false);
    expect(isProjectOrigin('https://docs.codeqlick.app.evil.com', project)).toBe(false);
    expect(isProjectOrigin('null', project)).toBe(false);
  });
});

describe('pageOf and toCsv', () => {
  it('keeps only origin and path', () => {
    expect(pageOf('https://docs.codeqlick.app/contact?x=1#top')).toBe(
      'https://docs.codeqlick.app/contact',
    );
    expect(pageOf('javascript:alert(1)')).toBeNull();
  });
  it('writes a column per field and neutralises formulas', () => {
    const csv = toCsv([
      {
        createdAt: new Date('2026-11-13T10:00:00Z'),
        data: { name: 'Ada', note: '=SUM(A1)' },
        page: null,
      },
      {
        createdAt: new Date('2026-11-13T09:00:00Z'),
        data: { name: 'Bob, Jr', extra: 'x' },
        page: 'https://a.b/c',
      },
    ]);
    expect(csv.startsWith('﻿date,name,note,extra,page\r\n')).toBe(true);
    expect(csv).toContain(`'=SUM(A1)`);
    expect(csv).toContain('"Bob, Jr"');
  });
});

describe('madridMonth', () => {
  it('starts at midnight in Madrid', () => {
    expect(madridMonth(new Date('2026-11-13T10:00:00Z'))).toEqual({
      start: new Date('2026-10-31T23:00:00Z'),
      key: '2026-11',
    });
    expect(madridMonth(new Date('2026-07-01T00:30:00Z')).start).toEqual(
      new Date('2026-06-30T22:00:00Z'),
    );
  });
});

describe('staticSpamReason', () => {
  const project = { slug: 'acme', hostingDomain: 'codeqlick.app', domains: ['acme.com'] };
  const ok = { name: 'Ada', email: 'ada@example.com', message: 'Hello, I need a quote.' };

  it('lets a normal post through, with or without a page', () => {
    expect(staticSpamReason(ok, 'https://acme.com/contact', project)).toBeNull();
    expect(staticSpamReason(ok, null, project)).toBeNull();
    expect(
      staticSpamReason({ message: 'See https://a.com and https://b.com' }, null, project),
    ).toBeNull();
  });

  it('flags link markup', () => {
    for (const message of [
      '[url=http://x.com]x[/url]',
      '[LINK=x]',
      'a [/url]',
      '<A class="x" HREF="http://x.com">x</a>',
    ]) {
      expect(staticSpamReason({ message }, null, project)).toBe('markup');
    }
    expect(staticSpamReason({ message: 'a <a name=x>' }, null, project)).toBeNull();
  });

  it('flags more than 3 links in all values together', () => {
    const three = { a: 'http://a.com https://b.com', b: 'www.c.com' };
    expect(staticSpamReason(three, null, project)).toBeNull();
    expect(staticSpamReason({ ...three, c: 'HTTPS://d.com' }, null, project)).toBe('links');
    // `https://www.x.com` is one link, not two.
    expect(
      staticSpamReason(
        { m: 'https://www.a.com https://www.b.com https://www.c.com' },
        null,
        project,
      ),
    ).toBeNull();
  });

  it('flags an email field that is not an address and a name that is a link or too long', () => {
    expect(staticSpamReason({ Email: 'not-an-email' }, null, project)).toBe('field');
    expect(staticSpamReason({ name: 'visit www.spam.com' }, null, project)).toBe('field');
    expect(staticSpamReason({ Nombre: 'https://spam.com' }, null, project)).toBe('field');
    expect(staticSpamReason({ first_name: 'a'.repeat(101) }, null, project)).toBe('field');
    expect(staticSpamReason({ fullname: 'a'.repeat(100) }, null, project)).toBeNull();
    // Other fields may hold anything (up to the link limit).
    expect(staticSpamReason({ message: 'a'.repeat(500), email2: 'x' }, null, project)).toBeNull();
  });

  it("flags a page that isn't the project's, but not a missing one", () => {
    expect(staticSpamReason(ok, 'https://spam.example/post', project)).toBe('page');
    expect(staticSpamReason(ok, 'https://acme.codeqlick.app/', project)).toBeNull();
    expect(staticSpamReason(ok, 'https://acme--0123abcd.codeqlick.app/x', project)).toBeNull();
  });

  it('reports the first rule that matches', () => {
    expect(staticSpamReason({ email: 'x', m: '[url=a]' }, 'https://spam.example/', project)).toBe(
      'markup',
    );
    expect(staticSpamReason({ email: 'x' }, 'https://spam.example/', project)).toBe('field');
  });
});

describe('contentHash', () => {
  it('is a SHA-256 in hex, whatever the order of the fields and the spaces around values', () => {
    const hash = contentHash({ a: '1', b: '2' });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(contentHash({ b: ' 2 ', a: '1' })).toBe(hash);
  });

  it('changes with the names and the values', () => {
    expect(contentHash({ a: '1' })).not.toBe(contentHash({ a: '2' }));
    expect(contentHash({ a: '1' })).not.toBe(contentHash({ b: '1' }));
  });
});
