import { describe, expect, it } from 'vitest';
import {
  isProjectOrigin,
  madridMonth,
  pageOf,
  parseSubmission,
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
