import { describe, expect, it } from 'vitest';
import { daysUntil, expiryFromRdap, rdapUrl, reminderDue } from './rdap.js';

describe('domain renewal', () => {
  it('finds the registry RDAP server of a domain', () => {
    const bootstrap = {
      services: [
        [['com', 'net'], ['https://rdap.verisign.com/com/v1/']],
        [['dev'], ['https://pubapi.registry.google/rdap']],
      ] as Array<[string[], string[]]>,
    };
    expect(rdapUrl(bootstrap, 'codeqlick.com')).toBe(
      'https://rdap.verisign.com/com/v1/domain/codeqlick.com',
    );
    expect(rdapUrl(bootstrap, 'x.dev')).toBe('https://pubapi.registry.google/rdap/domain/x.dev');
    expect(rdapUrl(bootstrap, 'peluqueria.es')).toBeNull();
  });

  it('reads the expiration date of an RDAP answer', () => {
    expect(
      expiryFromRdap({
        events: [
          { eventAction: 'registration', eventDate: '2020-01-10T10:00:00Z' },
          { eventAction: 'expiration', eventDate: '2027-01-10T10:00:00Z' },
        ],
      }),
    ).toBe('2027-01-10');
    expect(expiryFromRdap({ events: [] })).toBeNull();
    expect(expiryFromRdap(null)).toBeNull();
  });

  it('reminds 30 and 7 days before, once each', () => {
    const now = new Date('2026-10-16T10:00:00Z');
    expect(daysUntil('2026-11-15', now)).toBe(30);
    expect(reminderDue('2026-12-01', now, null)).toBeNull();
    expect(reminderDue('2026-11-15', now, null)).toBe(30);
    expect(reminderDue('2026-11-15', now, '2026-11-15:30')).toBeNull();
    expect(reminderDue('2026-10-20', now, '2026-10-20:30')).toBe(7);
    expect(reminderDue('2026-10-20', now, '2026-10-20:7')).toBeNull();
    // A renewed domain has a new date: reminders start over.
    expect(reminderDue('2026-10-20', now, '2025-10-20:7')).toBe(7);
    expect(reminderDue('2026-10-10', now, null)).toBeNull();
  });
});
