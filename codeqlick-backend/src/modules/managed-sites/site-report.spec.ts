import { describe, expect, it } from 'vitest';
import { proposalFromRequest } from './site-proposal.js';
import type { SiteRequest } from './site-request.js';
import { reportPeriod } from './site-report.js';

describe('reportPeriod', () => {
  it('is last month in Madrid, open from the 1st at 09:00', () => {
    // 1 April 2027, 08:30 Madrid (summer time): March, not open yet.
    const early = reportPeriod(new Date('2027-04-01T06:30:00Z'));
    expect(early).toMatchObject({ month: '2027-03', first: '2027-03-01', last: '2027-03-31' });
    expect(early.open).toBe(false);
    expect(early.start.toISOString()).toBe('2027-02-28T23:00:00.000Z');
    expect(early.end.toISOString()).toBe('2027-03-31T22:00:00.000Z');
    expect(reportPeriod(new Date('2027-04-01T07:00:00Z')).open).toBe(true);
    expect(reportPeriod(new Date('2027-04-02T00:00:00Z')).open).toBe(true);
  });

  it('goes back a year in January', () => {
    const period = reportPeriod(new Date('2027-01-05T12:00:00Z'));
    expect(period).toMatchObject({ month: '2026-12', last: '2026-12-31', days: 31, today: 5 });
  });
});

describe('proposalFromRequest', () => {
  it('drafts the basic website for the business, in the lead language', () => {
    const request = {
      preset: 'restaurante',
      business: { name: 'Casa Pepe', kind: 'Bar', city: 'Cádiz' },
    } as SiteRequest;
    const es = proposalFromRequest(request, 'es', '2027-01-30');
    expect(es).toMatchObject({
      title: 'Web de Casa Pepe',
      validUntil: '2027-03-01',
      items: [{ description: 'Web básica de una página', quantity: 1, unitPrice: 20_000 }],
    });
    expect(es.summary).toContain('Restaurante (como Casa Lola)');
    expect(es.summary).toContain('El que elijas');
    expect(proposalFromRequest(request, 'en', '2027-01-30').title).toBe('Casa Pepe website');
  });
});
