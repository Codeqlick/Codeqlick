import { describe, expect, it } from 'vitest';
import { brandOfHost, classifyHost, hostOfUrl, neoqlickMainHost } from './hosts';

const NEO = 'neoqlick.com';

describe('lib/hosts', () => {
  it('reads the main host from the URL', () => {
    expect(neoqlickMainHost('https://neoqlick.com')).toBe('neoqlick.com');
    expect(neoqlickMainHost('http://neoqlick.localhost:3000/')).toBe('neoqlick.localhost:3000');
    expect(neoqlickMainHost('https://www.neoqlick.com')).toBe('neoqlick.com');
    expect(neoqlickMainHost(undefined)).toBeNull();
    expect(neoqlickMainHost('nonsense')).toBeNull();
    expect(hostOfUrl('')).toBeNull();
  });

  it.each([
    ['neoqlick.com', 'neoqlick'],
    ['www.neoqlick.com', 'neoqlick'],
    ['cruising.neoqlick.com', 'neoqlick'],
    ['ACCOUNT.Neoqlick.com', 'neoqlick'],
    ['codeqlick.com', 'codeqlick'],
    ['cruising.codeqlick.com', 'codeqlick'],
    ['evilneoqlick.com', 'codeqlick'],
    ['neoqlick.com.evil.test', 'codeqlick'],
    ['127.0.0.1:3000', 'codeqlick'],
    [null, 'codeqlick'],
  ])('brand of %s is %s', (host, brand) => {
    expect(brandOfHost(host, NEO)).toBe(brand);
  });

  it('has no Neoqlick hosts when NEOQLICK_URL is unset', () => {
    expect(brandOfHost('neoqlick.com', null)).toBe('codeqlick');
  });

  it.each([
    ['neoqlick.com', { brand: 'neoqlick', kind: 'portal' }],
    ['www.neoqlick.com', { brand: 'neoqlick', kind: 'portal' }],
    ['cruising.neoqlick.com', { brand: 'neoqlick', kind: 'app' }],
    ['swipe.neoqlick.com:443', { brand: 'neoqlick', kind: 'app' }],
    ['videochat.neoqlick.com', { brand: 'neoqlick', kind: 'app' }],
    ['account.neoqlick.com', { brand: 'neoqlick', kind: 'account' }],
    ['meetings.neoqlick.com', { brand: 'neoqlick', kind: 'site' }],
    ['stats.neoqlick.com', { brand: 'neoqlick', kind: 'site' }],
    ['codeqlick.com', { brand: 'codeqlick', kind: 'site' }],
    ['www.codeqlick.com', { brand: 'codeqlick', kind: 'site' }],
    ['account.codeqlick.com', { brand: 'codeqlick', kind: 'account' }],
    ['meetings.codeqlick.com', { brand: 'codeqlick', kind: 'app' }],
    ['cruising.codeqlick.com', { brand: 'codeqlick', kind: 'app' }],
  ])('classifies %s', (host, expected) => {
    expect(classifyHost(host, NEO)).toEqual(expected);
  });

  it('works on local development hosts', () => {
    const dev = 'neoqlick.localhost:3000';
    expect(classifyHost('neoqlick.localhost:3000', dev)).toEqual({
      brand: 'neoqlick',
      kind: 'portal',
    });
    expect(classifyHost('cruising.neoqlick.localhost:3000', dev).kind).toBe('app');
    expect(classifyHost('account.neoqlick.localhost:3000', dev).kind).toBe('account');
    expect(classifyHost('cruising.localhost:3000', dev)).toEqual({
      brand: 'codeqlick',
      kind: 'app',
    });
  });
});
