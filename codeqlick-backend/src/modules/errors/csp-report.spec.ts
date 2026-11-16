import { describe, expect, it } from 'vitest';
import { blockedSource, cspViolations } from './csp-report.js';
import { cspReportSchema } from './errors.schemas.js';

const parse = (body: unknown) => cspReportSchema.parse(body);

describe('blockedSource', () => {
  it('keeps only the origin of a URL, or the keyword', () => {
    expect(blockedSource('https://evil.example/x.js?token=secret#a')).toBe('https://evil.example');
    expect(blockedSource('inline')).toBe('inline');
    expect(blockedSource('eval')).toBe('eval');
    expect(blockedSource('data:image/png;base64,AAAA')).toBe('data');
    expect(blockedSource('blob:https://codeqlick.com/1234')).toBe('blob');
    expect(blockedSource('')).toBe('inline');
    expect(blockedSource('not a url')).toBeNull();
  });
});

describe('cspViolations', () => {
  it('reads a report-uri report without keeping queries or IPs', () => {
    const [violation, ...rest] = cspViolations(
      parse({
        'csp-report': {
          'document-uri': 'https://codeqlick.com/en/blog/x?email=ada@example.com',
          'violated-directive': "script-src-elem 'self' 'nonce-abc'",
          'blocked-uri': 'https://evil.example/steal.js?c=1',
          'source-file': 'https://codeqlick.com/_next/static/chunks/a.js?v=2',
          'line-number': 12,
          'column-number': 3,
          'script-sample': 'alert(document.cookie);'.repeat(5),
          disposition: 'report',
          'original-policy': "default-src 'self'",
        },
      }),
      'Mozilla/5.0',
    );
    expect(rest).toEqual([]);
    expect(violation).toMatchObject({
      message: 'script-src-elem blocked https://evil.example',
      path: '/en/blog/x',
      userAgent: 'Mozilla/5.0',
    });
    expect(violation!.sample).toBe(
      [
        'disposition: report',
        'source: https://codeqlick.com/_next/static/chunks/a.js:12:3',
        `sample: ${'alert(document.cookie);'.repeat(5).slice(0, 40)}`,
      ].join('\n'),
    );
    expect(violation!.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('reads the Reporting API list, skipping other report types', () => {
    const violations = cspViolations(
      parse([
        {
          type: 'csp-violation',
          url: 'https://swipe.codeqlick.com/en/deck',
          user_agent: 'Chrome',
          body: {
            documentURL: 'https://swipe.codeqlick.com/en/deck',
            effectiveDirective: 'frame-src',
            blockedURL: 'https://ads.example/zone?id=1',
            disposition: 'enforce',
          },
        },
        { type: 'deprecation', body: { id: 'x' } },
      ]),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      message: 'frame-src blocked https://ads.example',
      path: '/en/deck',
      userAgent: 'Chrome',
    });
    expect(violations[0]!.sample).toBe('disposition: enforce');
  });

  it('groups by directive and origin, whatever the page or the path', () => {
    const one = (page: string, blocked: string) =>
      cspViolations(
        parse({
          'csp-report': {
            'document-uri': page,
            'effective-directive': 'img-src',
            'blocked-uri': blocked,
          },
        }),
      )[0]!.fingerprint;
    expect(one('https://codeqlick.com/a', 'https://cdn.example/1.png')).toBe(
      one('https://codeqlick.com/b', 'https://cdn.example/2.png'),
    );
    expect(one('https://codeqlick.com/a', 'https://cdn.example/1.png')).not.toBe(
      one('https://codeqlick.com/a', 'https://other.example/1.png'),
    );
  });

  it("drops browser extensions' reports and reports without a directive", () => {
    const report = (fields: Record<string, string>) =>
      cspViolations(parse({ 'csp-report': fields }));
    expect(
      report({ 'effective-directive': 'script-src', 'blocked-uri': 'chrome-extension://abc/x.js' }),
    ).toEqual([]);
    expect(
      report({
        'effective-directive': 'script-src',
        'blocked-uri': 'inline',
        'source-file': 'moz-extension://abc/content.js',
      }),
    ).toEqual([]);
    expect(report({ 'blocked-uri': 'inline' })).toEqual([]);
  });

  it('refuses bodies that are not reports', () => {
    expect(cspReportSchema.safeParse({ hello: 1 }).success).toBe(false);
    expect(cspReportSchema.safeParse([]).success).toBe(false);
    expect(
      cspReportSchema.safeParse(Array.from({ length: 21 }, () => ({ type: 'csp-violation' })))
        .success,
    ).toBe(false);
  });
});
