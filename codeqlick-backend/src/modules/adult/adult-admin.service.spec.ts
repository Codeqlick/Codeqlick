import { describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { MailMessage, MailService } from '../mail/mail.service.js';
import { AdultAdminService } from './adult-admin.service.js';
import type { AdultSafetyService } from './adult-safety.service.js';
import type { AdultRepository } from './adult.repository.js';

const NOW = new Date('2026-11-17T12:00:00Z');
const MINUTE = 60_000;

function build() {
  const appStore = (rows: Array<[string, number]>, newest: Date | null = null) => ({
    newestPendingAt: vi.fn().mockResolvedValue(newest),
    digestCounts: vi.fn().mockResolvedValue(rows),
    reportCountsOf: vi.fn().mockResolvedValue(new Map()),
  });
  const stores = {
    CRUISING: appStore([['Spots to review', 2]]),
    SWIPE: appStore([['Photos', 1]]),
    VIDEOCHAT: appStore([['Reports', 3]]),
  };
  const repository = {
    newestVerificationAt: vi.fn().mockResolvedValue(null),
    countPendingVerifications: vi.fn().mockResolvedValue(4),
  };
  const sent: MailMessage[] = [];
  const mail = {
    send: vi.fn().mockImplementation((m: MailMessage) => (sent.push(m), Promise.resolve())),
  };
  const config = {
    isTest: true,
    leadsNotifyTo: 'team@codeqlick.com',
    siteUrl: 'https://codeqlick.com',
  };
  const service = new AdultAdminService(
    repository as unknown as AdultRepository,
    { stores } as unknown as AdultSafetyService,
    mail as unknown as MailService,
    config as unknown as AppConfigService,
  );
  return { service, stores, repository, sent };
}

describe('AdultAdminService', () => {
  it('sends one digest for the three apps, the verification queue counted once', async () => {
    const t = build();
    expect(await t.service.sendDigest(NOW)).toBe(false);
    t.repository.newestVerificationAt.mockResolvedValue(new Date(NOW.getTime() - MINUTE));
    expect(await t.service.sendDigest(NOW)).toBe(true);
    await new Promise((resolve) => setImmediate(resolve));
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]?.subject).toBe('18+ apps: 10 things waiting');
    expect(t.sent[0]?.text).toContain('Cruising · Spots to review');
    expect(t.sent[0]?.text).toContain('Videochat · Reports');
    // Within the hour: nothing more, even with something new.
    t.stores.SWIPE.newestPendingAt.mockResolvedValue(new Date(NOW.getTime() + MINUTE));
    expect(await t.service.sendDigest(new Date(NOW.getTime() + 30 * MINUTE))).toBe(false);
    // After it, with something new.
    expect(await t.service.sendDigest(new Date(NOW.getTime() + 61 * MINUTE))).toBe(true);
    // Nothing new since.
    expect(await t.service.sendDigest(new Date(NOW.getTime() + 125 * MINUTE))).toBe(false);
  });

  it('marks people reported in the other apps', async () => {
    const t = build();
    t.stores.SWIPE.reportCountsOf.mockResolvedValue(new Map([['u1', { open: 1, total: 2 }]]));
    t.stores.VIDEOCHAT.reportCountsOf.mockResolvedValue(new Map([['u1', { open: 2, total: 2 }]]));
    const marks = await t.service.alsoReported('CRUISING', ['u1', 'u2']);
    expect(marks.get('u1')).toEqual({ apps: ['SWIPE', 'VIDEOCHAT'], open: 3 });
    expect(marks.has('u2')).toBe(false);
    expect(t.stores.CRUISING.reportCountsOf).not.toHaveBeenCalled();
  });
});
