import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { availableFromOffers, ovhSignature, zonePlan } from './ovh.js';

describe('ovhSignature', () => {
  it('signs secret, consumer key, method, URL, body and time with SHA-1', () => {
    const expected = createHash('sha1')
      .update('s3cret+ck+GET+https://eu.api.ovh.com/1.0/domain++1700000000')
      .digest('hex');
    expect(
      ovhSignature({
        appSecret: 's3cret',
        consumerKey: 'ck',
        method: 'GET',
        url: 'https://eu.api.ovh.com/1.0/domain',
        body: '',
        timestamp: 1700000000,
      }),
    ).toBe(`$1$${expected}`);
  });
});

describe('availableFromOffers', () => {
  it('is free when OVH offers to create it', () => {
    expect(availableFromOffers([{ action: 'create', orderable: true }])).toBe(true);
  });
  it('is taken when only a transfer is offered or creating is not orderable', () => {
    expect(availableFromOffers([{ action: 'transfer', orderable: true }])).toBe(false);
    expect(availableFromOffers([{ action: 'create', orderable: false }])).toBe(false);
  });
  it('is unknown otherwise', () => {
    expect(availableFromOffers([])).toBeNull();
    expect(availableFromOffers({ message: 'oops' })).toBeNull();
  });
});

describe('zonePlan', () => {
  const ip = '54.37.159.171';
  it('does nothing when the apex points here and www is a CNAME to it', () => {
    const records = [
      { id: 1, fieldType: 'A', subDomain: '', target: ip },
      { id: 2, fieldType: 'CNAME', subDomain: 'www', target: 'bar.es.' },
      { id: 3, fieldType: 'MX', subDomain: '', target: '1 mx1.mail.ovh.net.' },
    ];
    expect(zonePlan('bar.es', records, ip)).toEqual({ remove: [], create: [] });
  });
  it('replaces the parking records of the apex and www, never the MX', () => {
    const records = [
      { id: 1, fieldType: 'A', subDomain: '', target: '213.186.33.5' },
      { id: 2, fieldType: 'AAAA', subDomain: '', target: '2001:41d0:1:1b00:213:186:33:5' },
      { id: 3, fieldType: 'A', subDomain: 'www', target: '213.186.33.5' },
      { id: 4, fieldType: 'MX', subDomain: '', target: '1 mx1.mail.ovh.net.' },
    ];
    expect(zonePlan('bar.es', records, ip)).toEqual({ remove: [1, 2, 3], create: ['', 'www'] });
  });
  it('creates the records a zone lacks', () => {
    expect(zonePlan('bar.es', [], ip)).toEqual({ remove: [], create: ['', 'www'] });
  });
});
