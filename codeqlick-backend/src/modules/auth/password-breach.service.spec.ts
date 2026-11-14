import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../../config/app-config.service.js';
import { PasswordBreachService } from './password-breach.service.js';

const PASSWORD = 'password1234';
const SHA1 = createHash('sha1').update(PASSWORD).digest('hex').toUpperCase();
const PREFIX = SHA1.slice(0, 5);
const SUFFIX = SHA1.slice(5);

function service(on = true) {
  return new PasswordBreachService({ passwordBreachCheck: on } as AppConfigService);
}

function answer(body: string, status = 200) {
  return vi.fn().mockResolvedValue(new Response(body, { status }));
}

describe('PasswordBreachService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does nothing while switched off', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(service(false).isBreached(PASSWORD)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends only the first 5 characters of the SHA-1, asking for padding', async () => {
    const fetchMock = answer(`0018A45C4D1DEF81644B54AB7F969B88D65:3\r\n`);
    vi.stubGlobal('fetch', fetchMock);
    await service().isBreached(PASSWORD);
    const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${PREFIX}`);
    expect(url).not.toContain(SUFFIX);
    expect(init.headers['Add-Padding']).toBe('true');
  });

  it('finds a breached password among the suffixes (any case, CRLF lines)', async () => {
    vi.stubGlobal(
      'fetch',
      answer(`0018A45C4D1DEF81644B54AB7F969B88D65:3\r\n${SUFFIX.toLowerCase()}:52\r\n`),
    );
    await expect(service().isBreached(PASSWORD)).resolves.toBe(true);
  });

  it('accepts a password that is not in the list', async () => {
    vi.stubGlobal('fetch', answer(`0018A45C4D1DEF81644B54AB7F969B88D65:3\r\n`));
    await expect(service().isBreached(PASSWORD)).resolves.toBe(false);
  });

  it('ignores padding rows (count 0)', async () => {
    vi.stubGlobal('fetch', answer(`${SUFFIX}:0\r\n`));
    await expect(service().isBreached(PASSWORD)).resolves.toBe(false);
  });

  it('accepts the password when the service is unreachable or fails (fail open)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    await expect(service().isBreached(PASSWORD)).resolves.toBe(false);
    vi.stubGlobal('fetch', answer(`${SUFFIX}:52`, 503));
    await expect(service().isBreached(PASSWORD)).resolves.toBe(false);
  });

  it('answers a 400 field error on the given field', async () => {
    vi.stubGlobal('fetch', answer(`${SUFFIX}:52`));
    let error: unknown;
    try {
      await service().assertNotBreached(PASSWORD, 'newPassword');
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toEqual({
      errors: [{ path: 'newPassword', message: 'breached' }],
    });
  });
});
