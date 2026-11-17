import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { AppConfigService } from './app-config.service.js';
import { validateEnv } from './env.schema.js';

/** Neoqlick's settings (architecture 4.18): all optional, each falling back sensibly. */
function config(extra: Record<string, string> = {}): AppConfigService {
  const env = validateEnv({
    DATABASE_URL: 'postgresql://x:y@localhost:5432/z',
    JWT_ACCESS_SECRET: 'unit-test-secret-unit-test-secret-1234',
    SITE_URL: 'https://codeqlick.com',
    ...extra,
  });
  return new AppConfigService(new ConfigService(env as unknown as Record<string, unknown>));
}

describe('AppConfigService and Neoqlick', () => {
  it('works with no Neoqlick variable at all: its accounts use the website’s hosts', () => {
    const c = config();
    expect(c.neoqlickUrl).toBeUndefined();
    expect(c.siteUrlFor('NEOQLICK')).toBe('https://codeqlick.com');
    expect(c.accountUrlFor('NEOQLICK')).toBe('https://account.codeqlick.com');
    expect(c.neoqlickMail).toEqual({ from: undefined, user: undefined, password: undefined });
    expect(c.neoqlickTermsVersion).toBe('2026-11-17.1');
    expect(c.webauthnRpIdFor('NEOQLICK')).toBe('localhost');
    expect(c.corsOrigins).toEqual(['http://localhost:3000']);
  });

  it("derives Neoqlick's account host and apps from NEOQLICK_URL", () => {
    const c = config({ NEOQLICK_URL: 'https://neoqlick.com/' });
    expect(c.neoqlickUrl).toBe('https://neoqlick.com');
    expect(c.siteUrlFor('NEOQLICK')).toBe('https://neoqlick.com');
    expect(c.siteUrlFor('CODEQLICK')).toBe('https://codeqlick.com');
    expect(c.accountUrlFor('NEOQLICK')).toBe('https://account.neoqlick.com');
    expect(c.accountUrlFor('CODEQLICK')).toBe('https://account.codeqlick.com');
    expect(c.corsOrigins).toContain('https://neoqlick.com');
  });

  it("puts Neoqlick's apps under its own host and Codeqlick's under the website's", () => {
    const c = config({
      NEOQLICK_URL: 'https://neoqlick.com',
      VIDEOCHAT_ORIGINS: 'https://videochat.neoqlick.com',
    });
    expect(c.webappUrl('videochat')).toBe('https://videochat.neoqlick.com');
    expect(c.webappUrl('swipe')).toBe('https://swipe.neoqlick.com');
    expect(c.webappUrl('cruising')).toBe('https://cruising.neoqlick.com');
    expect(c.webappUrl('cloud')).toBe('https://cloud.codeqlick.com');
    expect(c.webappUrl('citas')).toBe('https://citas.codeqlick.com');
  });

  it("allows the video chat's WebSocket from Neoqlick's host next to the configured one", () => {
    const c = config({
      NEOQLICK_URL: 'https://neoqlick.com',
      VIDEOCHAT_ORIGINS: 'https://videochat.codeqlick.com',
    });
    expect(c.videochatOrigins).toEqual([
      'https://videochat.codeqlick.com',
      'https://videochat.neoqlick.com',
    ]);
    expect(c.webappUrl('videochat')).toBe('https://videochat.neoqlick.com');
    expect(
      config({ VIDEOCHAT_ORIGINS: 'https://videochat.codeqlick.com' }).videochatOrigins,
    ).toEqual(['https://videochat.codeqlick.com']);
  });

  it('gives passkeys a relying party per realm', () => {
    const production = config({
      NODE_ENV: 'production',
      NEOQLICK_URL: 'https://neoqlick.com',
      VIDEOCHAT_ORIGINS: 'https://videochat.neoqlick.com',
    });
    expect(production.webauthnRpIdFor('CODEQLICK')).toBe('codeqlick.com');
    expect(production.webauthnRpIdFor('NEOQLICK')).toBe('neoqlick.com');
    expect(production.webauthnOriginsFor('NEOQLICK')).toEqual([
      'https://neoqlick.com',
      'https://account.neoqlick.com',
      'https://videochat.neoqlick.com',
      'https://swipe.neoqlick.com',
      'https://cruising.neoqlick.com',
    ]);
    expect(production.webauthnOriginsFor('CODEQLICK')).toContain('https://account.codeqlick.com');
    expect(production.webauthnOriginsFor('CODEQLICK')).not.toContain('https://neoqlick.com');

    const explicit = config({
      WEBAUTHN_RP_ID_NEOQLICK: 'account.neoqlick.localhost',
      WEBAUTHN_ORIGINS_NEOQLICK: 'http://account.neoqlick.localhost:3000/',
    });
    expect(explicit.webauthnRpIdFor('NEOQLICK')).toBe('account.neoqlick.localhost');
    expect(explicit.webauthnOriginsFor('NEOQLICK')).toEqual([
      'http://account.neoqlick.localhost:3000',
    ]);
    expect(explicit.webauthnRpIdFor('CODEQLICK')).toBe('localhost');
  });

  it("falls back from Neoqlick's legal holder to the website's", () => {
    expect(config().neoqlickLegal).toEqual({
      tradeName: 'Neoqlick',
      ownerName: undefined,
      taxId: undefined,
      address: undefined,
    });
    expect(
      config({
        LEGAL_OWNER_NAME: 'Ada Lovelace',
        LEGAL_OWNER_TAX_ID: 'X123',
        LEGAL_OWNER_ADDRESS: 'Somewhere 1',
        NEOQLICK_LEGAL_OWNER_NAME: 'Neo Holder',
        NEOQLICK_TRADE_NAME: 'Neoqlick Studio',
      }).neoqlickLegal,
    ).toEqual({
      tradeName: 'Neoqlick Studio',
      ownerName: 'Neo Holder',
      taxId: 'X123',
      address: 'Somewhere 1',
    });
  });

  it("uses Neoqlick's push keys when both are set, Codeqlick's until then", () => {
    const keys = { VAPID_PUBLIC_KEY: 'cpub', VAPID_PRIVATE_KEY: 'cpriv' };
    expect(config(keys).neoqlickVapid).toEqual({
      publicKey: 'cpub',
      privateKey: 'cpriv',
      subject: 'mailto:hello@codeqlick.com',
    });
    expect(
      config({
        ...keys,
        NEOQLICK_VAPID_PUBLIC_KEY: 'npub',
        NEOQLICK_VAPID_PRIVATE_KEY: 'npriv',
      }).neoqlickVapid,
    ).toEqual({ publicKey: 'npub', privateKey: 'npriv', subject: 'mailto:hello@neoqlick.com' });
    expect(config().neoqlickVapid).toBeUndefined();
  });

  it('reads the mailbox settings', () => {
    expect(
      config({
        MAIL_FROM_NEOQLICK: 'Neoqlick <hello@neoqlick.com>',
        SMTP_USER_NEOQLICK: 'hello@neoqlick.com',
        SMTP_PASSWORD_NEOQLICK: 'secret',
      }).neoqlickMail,
    ).toEqual({
      from: 'Neoqlick <hello@neoqlick.com>',
      user: 'hello@neoqlick.com',
      password: 'secret',
    });
  });
});
