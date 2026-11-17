import { describe, expect, it } from 'vitest';
import { isRealm, realmFromHeader } from './realm.js';
import { isSsoClientOf, SSO_CLIENTS, SSO_CLIENTS_BY_REALM } from './sso-clients.js';
import { appsOfRealm, CODEQLICK_APPS, NEOQLICK_APPS, WEBAPPS } from './webapps.js';

describe('realmFromHeader', () => {
  it('is NEOQLICK only for X-Realm: NEOQLICK; anything else, or absent, is CODEQLICK', () => {
    expect(realmFromHeader('NEOQLICK')).toBe('NEOQLICK');
    expect(realmFromHeader(' neoqlick ')).toBe('NEOQLICK');
    expect(realmFromHeader(['NEOQLICK', 'CODEQLICK'])).toBe('NEOQLICK');
    expect(realmFromHeader(undefined)).toBe('CODEQLICK');
    expect(realmFromHeader('')).toBe('CODEQLICK');
    expect(realmFromHeader('CODEQLICK')).toBe('CODEQLICK');
    expect(realmFromHeader('admin')).toBe('CODEQLICK');
  });

  it('knows the two realms', () => {
    expect(isRealm('NEOQLICK')).toBe(true);
    expect(isRealm('CODEQLICK')).toBe(true);
    expect(isRealm('ADMIN')).toBe(false);
    expect(isRealm(undefined)).toBe(false);
  });
});

describe('apps and single sign-on clients per realm', () => {
  it('splits the web apps between the brands', () => {
    expect([...CODEQLICK_APPS].sort()).toEqual(['citas', 'cloud', 'meetings']);
    expect([...NEOQLICK_APPS].sort()).toEqual(['cruising', 'swipe', 'videochat']);
    expect([...WEBAPPS].sort()).toEqual([...CODEQLICK_APPS, ...NEOQLICK_APPS].sort());
    expect(appsOfRealm('NEOQLICK')).toBe(NEOQLICK_APPS);
    expect(appsOfRealm('CODEQLICK')).toBe(CODEQLICK_APPS);
  });

  it("gives each realm its own clients: Codeqlick's site and apps, Neoqlick's three apps", () => {
    expect(SSO_CLIENTS_BY_REALM.CODEQLICK).toEqual(['site', 'meetings', 'citas', 'cloud']);
    expect(SSO_CLIENTS_BY_REALM.NEOQLICK).toEqual(['videochat', 'swipe', 'cruising']);
    expect(new Set(SSO_CLIENTS).size).toBe(SSO_CLIENTS.length);
    for (const client of SSO_CLIENTS_BY_REALM.NEOQLICK) {
      expect(isSsoClientOf('NEOQLICK', client)).toBe(true);
      expect(isSsoClientOf('CODEQLICK', client)).toBe(false);
    }
    for (const client of SSO_CLIENTS_BY_REALM.CODEQLICK) {
      expect(isSsoClientOf('CODEQLICK', client)).toBe(true);
      expect(isSsoClientOf('NEOQLICK', client)).toBe(false);
    }
  });
});
