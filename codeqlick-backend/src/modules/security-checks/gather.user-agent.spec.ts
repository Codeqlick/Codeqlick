import { beforeEach, describe, expect, it, vi } from 'vitest';

const safeFetch = vi.fn();
vi.mock('../../common/safe-fetch.js', () => ({
  safeFetch: (url: string, options: unknown) => safeFetch(url, options) as unknown,
  resolvePublicAddress: () => Promise.reject(new Error('no network in tests')),
}));

const { networkProbes, SURFACE_USER_AGENT, USER_AGENT } = await import('./gather.js');

describe('networkProbes user agent', () => {
  beforeEach(() => {
    safeFetch.mockReset();
    safeFetch.mockResolvedValue({});
  });

  it("keeps the public check's user agent by default", async () => {
    await networkProbes().fetch('https://a.com/');
    expect(safeFetch).toHaveBeenCalledWith(
      'https://a.com/',
      expect.objectContaining({ userAgent: USER_AGENT }),
    );
    expect(USER_AGENT).toBe('Codeqlick-SecurityCheck/1.0 (+https://codeqlick.com/security-check)');
  });

  it("sends the Surface monitor's own when asked, for every request", async () => {
    const probes = networkProbes(undefined, SURFACE_USER_AGENT);
    await probes.fetch('https://a.com/');
    await probes.fetch('https://a.com/.well-known/security.txt', { timeoutMs: 10_000 });
    expect(SURFACE_USER_AGENT).toBe(
      'Codeqlick-SurfaceMonitor/1.0 (+https://codeqlick.com/security-check)',
    );
    for (const [, options] of safeFetch.mock.calls) {
      expect(options).toEqual(expect.objectContaining({ userAgent: SURFACE_USER_AGENT }));
    }
    expect(safeFetch).toHaveBeenCalledTimes(2);
  });

  it('lets a request override its own options but not lose the agent', async () => {
    await networkProbes(undefined, SURFACE_USER_AGENT).fetch('https://a.com/', { insecure: true });
    expect(safeFetch).toHaveBeenCalledWith(
      'https://a.com/',
      expect.objectContaining({ userAgent: SURFACE_USER_AGENT, insecure: true }),
    );
  });
});
