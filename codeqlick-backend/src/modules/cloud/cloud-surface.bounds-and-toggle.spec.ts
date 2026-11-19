import { describe, expect, it, vi } from 'vitest';
import { CloudDomainsService } from './cloud-domains.service.js';
import { changeShortText, changeText, boundChange } from './cloud-surface.js';

describe('setSurfaceMonitor concurrency', () => {
  it('records one event when two enables run at the same time', async () => {
    const domain = {
      id: 'd1',
      projectId: 'p1',
      name: 'example.org',
      state: 'LIVE',
      surfaceMonitor: false,
      surfaceNextAt: null,
    };
    // The first enable changes the row, the second finds it already on.
    let on = false;
    const enable = vi.fn(async () => {
      const changed = !on;
      on = true;
      return { ok: true, domain: { ...domain, surfaceMonitor: true }, changed };
    });
    const record = vi.fn(async () => undefined);
    const service = new CloudDomainsService(
      { findDomain: async () => domain } as never,
      {
        project: async () => ({
          project: { id: 'p1', slug: 'site', teamId: 't1' },
          membership: { team: { plan: 'FREE' } },
        }),
      } as never,
      { limits: () => ({ surfaceDomains: 5 }), record } as never,
      {} as never,
      { lastScans: async () => new Map() } as never,
      { enable } as never,
      {} as never,
      { isTest: true } as never,
    );
    const ctx = {} as never;
    await Promise.all([
      service.setSurfaceMonitor(ctx, 'p1', 'd1', { surfaceMonitor: true }),
      service.setSurfaceMonitor(ctx, 'p1', 'd1', { surfaceMonitor: true }),
    ]);
    expect(enable).toHaveBeenCalledTimes(2);
    expect(record).toHaveBeenCalledTimes(1);
  });
});

describe('alert value bounds', () => {
  it('cuts long values, lists ten and counts the rest', () => {
    const added = Array.from({ length: 13 }, (_, i) => `v${i}${'x'.repeat(300)}`);
    const text = changeText({ kind: 'records', record: 'mx', added, removed: [] }, 'en');
    expect(text).toContain('…');
    expect(text.endsWith('+3 more')).toBe(true);
    expect(text.match(/"/g)).toHaveLength(20);
    const es = changeText({ kind: 'libs', added }, 'es');
    expect(es.endsWith('+3 más')).toBe(true);
    const payload = boundChange({ kind: 'libs', added });
    expect(payload).toMatchObject({ more: 3 });
  });

  it('breaks URL schemes so the email does not link them', () => {
    const text = changeText(
      { kind: 'records', record: 'spf', added: ['v=spf1 see https://evil.example/x'], removed: [] },
      'en',
    );
    expect(text).not.toContain('https://');
  });

  it('uses the singular for one day in the short text', () => {
    const change = { kind: 'cert_expiry', threshold: 7, days: 1 } as const;
    expect(changeShortText(change, 'en')).toBe('certificate expires in 1 day');
    expect(changeShortText(change, 'es')).toBe('el certificado caduca en 1 día');
  });
});
