import { BadRequestException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../../config/app-config.service.js';
import { CaptchaService } from './captcha.service.js';

function service(secret: string | undefined) {
  return new CaptchaService({
    turnstileSecretFor: () => secret,
  } as unknown as AppConfigService);
}

/** One secret per realm, as the configuration gives them. */
function perRealm(secrets: { CODEQLICK?: string; NEOQLICK?: string }) {
  return new CaptchaService({
    turnstileSecretFor: (realm: 'CODEQLICK' | 'NEOQLICK') => secrets[realm],
  } as unknown as AppConfigService);
}

function answer(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

describe('CaptchaService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does nothing without a secret', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(service(undefined).verify(undefined, null)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a missing token', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(service('secret').verify(undefined, null)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('accepts a token Cloudflare accepts, sending the secret and the IP', async () => {
    const fetchMock = answer({ success: true });
    vi.stubGlobal('fetch', fetchMock);
    await service('secret').verify('token', '203.0.113.7');
    const [, init] = fetchMock.mock.calls[0] as [string, { body: URLSearchParams }];
    expect(init.body.get('secret')).toBe('secret');
    expect(init.body.get('response')).toBe('token');
    expect(init.body.get('remoteip')).toBe('203.0.113.7');
  });

  it('refuses a token Cloudflare refuses', async () => {
    vi.stubGlobal('fetch', answer({ success: false, 'error-codes': ['invalid-input-response'] }));
    await expect(service('secret').verify('bad', null)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lets the request through when Cloudflare is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    await expect(service('secret').verify('token', null)).resolves.toBeUndefined();
    vi.stubGlobal('fetch', answer({}, 500));
    await expect(service('secret').verify('token', null)).resolves.toBeUndefined();
  });

  it("checks a realm's tokens with that realm's secret, and not at all without one", async () => {
    const fetchMock = answer({ success: true });
    vi.stubGlobal('fetch', fetchMock);
    const captcha = perRealm({ CODEQLICK: 'codeqlick-secret', NEOQLICK: 'neoqlick-secret' });
    await captcha.verify('t', null, 'NEOQLICK');
    await captcha.verify('t', null, 'CODEQLICK');
    await captcha.verify('t', null);
    const secrets = fetchMock.mock.calls.map(([, init]) =>
      (init as { body: URLSearchParams }).body.get('secret'),
    );
    expect(secrets).toEqual(['neoqlick-secret', 'codeqlick-secret', 'codeqlick-secret']);

    // Neoqlick without its own secret is open; it never borrows Codeqlick's.
    fetchMock.mockClear();
    await perRealm({ CODEQLICK: 'codeqlick-secret' }).verify(undefined, null, 'NEOQLICK');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
