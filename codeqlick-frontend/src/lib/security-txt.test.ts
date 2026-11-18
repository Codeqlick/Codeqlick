import { describe, expect, it } from 'vitest';
import { requestedUrl, securityTxt } from './security-txt';

describe('securityTxt', () => {
  const text = securityTxt({
    contact: 'hello@codeqlick.com',
    canonical: 'https://meetings.codeqlick.com/.well-known/security.txt',
    policy: 'https://codeqlick.com/en/security',
    now: new Date('2026-11-17T10:00:00.123Z'),
  });
  const fields = Object.fromEntries(
    text
      .trim()
      .split('\n')
      .map((line) => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 2)]),
  );

  it('has the fields of RFC 9116 and ends with a newline', () => {
    expect(fields).toEqual({
      Contact: 'mailto:hello@codeqlick.com',
      Expires: '2027-11-16T10:00:00Z',
      'Preferred-Languages': 'en, es',
      Canonical: 'https://meetings.codeqlick.com/.well-known/security.txt',
      Policy: 'https://codeqlick.com/en/security',
    });
    expect(text.endsWith('\n')).toBe(true);
  });

  it('expires less than a year after the request', () => {
    const now = new Date('2026-11-17T10:00:00Z');
    const expires = new Date(fields.Expires!);
    expect(expires.getTime() - now.getTime()).toBeLessThan(365 * 24 * 3600 * 1000);
    expect(expires.getTime()).toBeGreaterThan(now.getTime());
  });
});

describe('requestedUrl', () => {
  it('uses the forwarded host and protocol', () => {
    const headers = new Headers({
      host: 'localhost:3000',
      'x-forwarded-host': 'citas.codeqlick.com',
      'x-forwarded-proto': 'https',
    });
    expect(requestedUrl(headers, '/.well-known/security.txt')).toBe(
      'https://citas.codeqlick.com/.well-known/security.txt',
    );
  });

  it('falls back to Host, and refuses a host that is not a name', () => {
    expect(requestedUrl(new Headers({ host: 'localhost:3000' }), '/x')).toBe(
      'https://localhost:3000/x',
    );
    expect(requestedUrl(new Headers({ host: 'evil.com/<script>' }), '/x')).toBeNull();
  });
});
