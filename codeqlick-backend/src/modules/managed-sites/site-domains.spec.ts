import { describe, expect, it } from 'vitest';
import { domainStateOf, mailStateOf } from './site-domains.service.js';

const ip = '54.37.159.171';

describe('domainStateOf', () => {
  it('is UNREGISTERED when nobody has it, or nothing is known and it resolves nowhere', () => {
    expect(domainStateOf({ registered: false, addresses: [], serverIp: ip, https: false })).toBe(
      'UNREGISTERED',
    );
    expect(domainStateOf({ registered: null, addresses: [], serverIp: ip, https: false })).toBe(
      'UNREGISTERED',
    );
  });
  it('is ELSEWHERE when registered but not resolving here or not serving HTTPS yet', () => {
    expect(
      domainStateOf({ registered: true, addresses: ['1.2.3.4'], serverIp: ip, https: true }),
    ).toBe('ELSEWHERE');
    expect(domainStateOf({ registered: null, addresses: [ip], serverIp: ip, https: false })).toBe(
      'ELSEWHERE',
    );
  });
  it('is LIVE when it resolves here and answers over HTTPS', () => {
    expect(domainStateOf({ registered: null, addresses: [ip], serverIp: ip, https: true })).toBe(
      'LIVE',
    );
  });
});

describe('mailStateOf', () => {
  it('tells OVH mail from another provider or none', () => {
    expect(mailStateOf([])).toBe('NONE');
    expect(mailStateOf(['mx1.mail.ovh.net.', 'mx3.mail.ovh.net'])).toBe('OVH');
    expect(mailStateOf(['aspmx.l.google.com', 'mx1.mail.ovh.net'])).toBe('OTHER');
  });
});
