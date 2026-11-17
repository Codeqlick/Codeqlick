import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { ActivityService } from '../activity/activity.service.js';
import type { CruisingRepository } from '../cruising/cruising.repository.js';
import type { MailMessage, MailService } from '../mail/mail.service.js';
import type { SwipeRepository } from '../swipe/swipe.repository.js';
import type { VideochatRepository } from '../videochat/videochat.repository.js';
import { AdultEvents } from './adult-events.js';
import { AdultSafetyService, BANNED_ENTRY_MESSAGE } from './adult-safety.service.js';
import type { AdultVerificationService } from './adult-verification.service.js';
import type { AdultRepository } from './adult.repository.js';
import { emailHash } from './adult.rules.js';

const NOW = new Date('2026-11-17T12:00:00Z');
const HOUR = 60 * 60 * 1000;
const KEY = 'k'.repeat(40);
const admin: AuthUser = {
  id: 'admin',
  email: 'a@codeqlick.com',
  name: 'Admin',
  role: 'ADMIN',
  realm: 'CODEQLICK',
};

/** One app's repository as the shared safety sees it, recording what it was asked. */
function store(
  app: string,
  state: { suspendedAt: Date | null; suspendedUntil: Date | null } | null,
) {
  return {
    app,
    applyBlock: vi.fn().mockResolvedValue(undefined),
    clearBetween: vi.fn().mockResolvedValue(undefined),
    removeBlock: vi.fn().mockResolvedValue(true),
    suspensionState: vi.fn().mockResolvedValue(state),
    setSuspension: vi.fn().mockResolvedValue(undefined),
    clearSuspensionAt: vi.fn().mockResolvedValue(undefined),
    namesOf: vi.fn().mockResolvedValue(new Map()),
    blocksMadeBy: vi.fn().mockResolvedValue([]),
  };
}

function build() {
  const db = { tx: true };
  const repository = {
    transaction: vi.fn().mockImplementation((work: (db: unknown) => unknown) => work(db)),
    findUser: vi
      .fn()
      .mockResolvedValue({ id: 'u1', email: 'u1@example.com', name: 'U', locale: 'EN' }),
    liftSuspensions: vi.fn().mockResolvedValue([]),
    createSuspension: vi
      .fn()
      .mockImplementation((_db: unknown, data: Record<string, unknown>) =>
        Promise.resolve({ id: 's1', liftedAt: null, ...data }),
      ),
    activeSuspension: vi.fn().mockResolvedValue(null),
    isBannedHash: vi.fn().mockResolvedValue(false),
    createBannedEmail: vi.fn().mockResolvedValue(undefined),
    deleteBannedHash: vi.fn().mockResolvedValue(1),
  };
  const cruising = store('CRUISING', { suspendedAt: null, suspendedUntil: null });
  const swipe = store('SWIPE', null);
  const videochat = store('VIDEOCHAT', {
    suspendedAt: new Date(NOW.getTime() - HOUR),
    suspendedUntil: null,
  });
  const verification = {
    withdrawSilently: vi.fn().mockResolvedValue(undefined),
    forgetPhoto: vi.fn().mockResolvedValue(undefined),
  };
  const sent: MailMessage[] = [];
  const mail = {
    send: vi.fn().mockImplementation((m: MailMessage) => (sent.push(m), Promise.resolve())),
  };
  const activity = { record: vi.fn().mockResolvedValue(undefined) };
  const events = new AdultEvents();
  const config = {
    isTest: true,
    adultBanHashKey: KEY,
    siteUrl: 'https://codeqlick.com',
    siteUrlFor: (realm: string) =>
      realm === 'NEOQLICK' ? 'https://neoqlick.com' : 'https://codeqlick.com',
    accountUrlFor: (realm: string) =>
      realm === 'NEOQLICK' ? 'https://account.neoqlick.com' : 'https://account.codeqlick.com',
  };
  const service = new AdultSafetyService(
    repository as unknown as AdultRepository,
    verification as unknown as AdultVerificationService,
    events,
    activity as unknown as ActivityService,
    mail as unknown as MailService,
    config as unknown as AppConfigService,
    cruising as unknown as CruisingRepository,
    swipe as unknown as SwipeRepository,
    videochat as unknown as VideochatRepository,
  );
  return {
    service,
    repository,
    cruising,
    swipe,
    videochat,
    verification,
    sent,
    activity,
    events,
    db,
  };
}

describe('AdultSafetyService', () => {
  let t: ReturnType<typeof build>;
  beforeEach(() => {
    t = build();
  });

  describe('blocks (decision 112)', () => {
    it('writes the block and its side effects in the three apps, in one transaction', async () => {
      const seen: unknown[] = [];
      t.events.blocked.subscribe((event) => seen.push(event));
      await t.service.block('a', 'b', 'SWIPE');
      expect(t.repository.transaction).toHaveBeenCalledTimes(1);
      for (const app of [t.cruising, t.swipe, t.videochat]) {
        expect(app.applyBlock).toHaveBeenCalledWith(t.db, 'a', 'b', 'SWIPE');
      }
      // The video chat hears it after the commit (it ends a live call between them).
      expect(seen).toEqual([{ a: 'a', b: 'b', sourceApp: 'SWIPE' }]);
    });

    it('refuses blocking oneself', async () => {
      await expect(t.service.block('a', 'a', 'CRUISING')).rejects.toMatchObject({ status: 400 });
      expect(t.cruising.applyBlock).not.toHaveBeenCalled();
    });

    it('lifts a block in the three apps', async () => {
      t.swipe.removeBlock.mockResolvedValue(false);
      expect(await t.service.unblock('a', 'b')).toBe(true);
      for (const app of [t.cruising, t.swipe, t.videochat]) {
        expect(app.removeBlock).toHaveBeenCalledWith(t.db, 'a', 'b');
      }
    });

    it('lists each person once, named in the asking app or not at all', async () => {
      const older = new Date(NOW.getTime() - HOUR);
      t.cruising.blocksMadeBy.mockResolvedValue([
        { blockedId: 'b', sourceApp: null, createdAt: older },
        { blockedId: 'c', sourceApp: 'CRUISING', createdAt: NOW },
      ]);
      t.swipe.blocksMadeBy.mockResolvedValue([
        { blockedId: 'b', sourceApp: 'SWIPE', createdAt: NOW },
      ]);
      t.cruising.namesOf.mockResolvedValue(new Map([['c', 'pier_fan']]));
      const { items } = await t.service.blocks('a', 'CRUISING');
      expect(items).toEqual([
        expect.objectContaining({ name: 'pier_fan', sourceApp: 'CRUISING' }),
        expect.objectContaining({ name: null, sourceApp: 'SWIPE', createdAt: older.toISOString() }),
      ]);
      expect(JSON.stringify(items)).not.toContain('"b"');
    });
  });

  describe('shared suspensions (decision 114)', () => {
    it('refuses a category that is not shared', async () => {
      await expect(
        t.service.suspend(admin, 'u1', {
          category: 'SPAM' as never,
          sourceApp: 'SWIPE',
          reason: 'x',
          duration: '7d',
        }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('writes the same end into each profile, never shortening a longer one', async () => {
      const suspended: string[] = [];
      t.events.suspended.subscribe((userId) => suspended.push(userId));
      await t.service.suspend(
        admin,
        'u1',
        {
          category: 'MINOR',
          sourceApp: 'CRUISING',
          reason: 'Minor',
          duration: '7d',
          reportId: 'r1',
        },
        NOW,
      );
      const until = new Date(NOW.getTime() + 7 * 24 * HOUR);
      expect(t.repository.createSuspension).toHaveBeenCalledWith(
        t.db,
        expect.objectContaining({ category: 'MINOR', until, reportId: 'r1', createdAt: NOW }),
      );
      expect(t.cruising.setSuspension).toHaveBeenCalledWith(t.db, 'u1', {
        at: NOW,
        until,
        reason: 'Minor',
        category: 'MINOR',
        byId: 'admin',
        reportId: 'r1',
      });
      // Swipe: never entered. Video chat: a permanent suspension of its own stays.
      expect(t.swipe.setSuspension).not.toHaveBeenCalled();
      expect(t.videochat.setSuspension).not.toHaveBeenCalled();
      expect(suspended).toEqual(['u1']);
      expect(t.verification.withdrawSilently).toHaveBeenCalled();
      expect(t.activity.record).toHaveBeenCalledWith(
        admin,
        expect.objectContaining({ action: 'adult.suspension', targetId: 'u1' }),
      );
      await new Promise((resolve) => setImmediate(resolve));
      expect(t.sent).toHaveLength(1);
      expect(t.sent[0]?.subject).toBe("Your access to Codeqlick's 18+ apps is suspended");
      for (const app of ['Cruising', 'Swipe', 'Videochat', 'video chat']) {
        expect(t.sent[0]?.text).not.toContain(app);
      }
    });

    it('lifts it in the three apps with the reason, or answers 404', async () => {
      await expect(t.service.lift(admin, 'u1', 'Wrong report', NOW)).rejects.toMatchObject({
        status: 404,
      });
      const createdAt = new Date(NOW.getTime() - HOUR);
      t.repository.liftSuspensions.mockResolvedValue([{ id: 's1', createdAt }]);
      await t.service.lift(admin, 'u1', 'Wrong report', NOW);
      for (const app of [t.cruising, t.swipe, t.videochat]) {
        expect(app.clearSuspensionAt).toHaveBeenCalledWith(
          t.db,
          'u1',
          createdAt,
          'admin',
          'Wrong report',
        );
      }
      expect(t.activity.record).toHaveBeenCalledWith(
        admin,
        expect.objectContaining({
          action: 'adult.suspension_lifted',
          details: { reason: 'Wrong report' },
        }),
      );
    });

    it('applies an active one to an app entered later', async () => {
      t.repository.activeSuspension.mockResolvedValue({
        userId: 'u1',
        createdAt: NOW,
        until: null,
        liftedAt: null,
        reason: 'Minor',
        category: 'MINOR',
        sourceApp: 'VIDEOCHAT',
        byId: 'admin',
        reportId: 'r1',
      });
      await t.service.reapply('u1', NOW, ['CRUISING']);
      expect(t.cruising.setSuspension).toHaveBeenCalledWith(
        t.db,
        'u1',
        expect.objectContaining({ at: NOW, until: null, reportId: null }),
      );
      expect(t.videochat.setSuspension).not.toHaveBeenCalled();
    });
  });

  describe('deleted accounts (decision 120)', () => {
    it('keeps only a hash of the email when a shared suspension is in force', async () => {
      const until = new Date(NOW.getTime() + 30 * 24 * HOUR);
      t.repository.activeSuspension.mockResolvedValue({
        createdAt: NOW,
        until,
        liftedAt: null,
        category: 'ILLEGAL',
      });
      await t.service.beforeAccountDeletion('u1', 'Ana.Lopez+x@gmail.com', NOW);
      expect(t.repository.createBannedEmail).toHaveBeenCalledWith({
        emailHash: emailHash(KEY, 'analopez@gmail.com'),
        category: 'ILLEGAL',
        expiresAt: until,
      });
      expect(t.verification.forgetPhoto).toHaveBeenCalledWith('u1');
    });

    it('keeps nothing without one', async () => {
      await t.service.beforeAccountDeletion('u1', 'u1@example.com', NOW);
      expect(t.repository.createBannedEmail).not.toHaveBeenCalled();
    });

    it('refuses entry with a matching email, with a neutral message', async () => {
      t.repository.isBannedHash.mockResolvedValue(true);
      await expect(t.service.checkEntry('analopez@gmail.com', NOW)).rejects.toMatchObject({
        status: 403,
        message: BANNED_ENTRY_MESSAGE,
      });
      expect(t.repository.isBannedHash).toHaveBeenCalledWith(
        emailHash(KEY, 'analopez@gmail.com'),
        NOW,
      );
    });

    it('lets the team delete a hash on an accepted appeal, logging no address', async () => {
      await t.service.deleteBannedEmail(admin, 'someone@example.com');
      expect(JSON.stringify(t.activity.record.mock.calls)).not.toContain('someone@example.com');
      t.repository.deleteBannedHash.mockResolvedValue(0);
      await expect(t.service.deleteBannedEmail(admin, 'x@example.com')).rejects.toMatchObject({
        status: 404,
      });
    });
  });
});
