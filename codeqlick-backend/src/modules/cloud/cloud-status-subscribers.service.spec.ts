import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { CloudStatusSubscriber } from '../../generated/prisma/client.js';
import type { MailMessage, MailService } from '../mail/mail.service.js';
import type { CloudMonitorsService } from './cloud-monitors.service.js';
import { hashToken } from './cloud-status-subscribers.js';
import type {
  CloudStatusSubscribersRepository,
  DispatchRow,
  SignupPage,
} from './cloud-status-subscribers.repository.js';
import { CloudStatusSubscribersService } from './cloud-status-subscribers.service.js';
import type { CloudTeamsService } from './cloud-teams.service.js';

const now = new Date('2026-11-17T10:00:00Z');
const TEAM = '00000000-0000-4000-8000-000000000001';

function page(extra: Partial<SignupPage> = {}): SignupPage {
  return {
    enabled: true,
    subscriptions: true,
    title: 'Acme status',
    team: { id: TEAM, name: 'Acme', slug: 'acme', plan: 'FREE' },
    ...extra,
  };
}

function subscriber(id: string, extra: Partial<CloudStatusSubscriber> = {}): CloudStatusSubscriber {
  return {
    id,
    teamId: TEAM,
    email: `${id}@example.com`,
    locale: 'EN',
    status: 'ACTIVE',
    confirmTokenHash: null,
    confirmExpiresAt: null,
    confirmSentAt: null,
    confirmedAt: new Date('2026-11-01T00:00:00Z'),
    unsubscribeToken: `unsub-${id}`,
    unsubscribedAt: null,
    createdAt: new Date('2026-11-01T00:00:00Z'),
    ...extra,
  };
}

function dispatch(extra: Partial<DispatchRow> = {}): DispatchRow {
  return {
    id: 'd1',
    teamId: TEAM,
    noticeId: 'n1',
    updateId: 'u1',
    kind: 'NOTICE',
    cursor: null,
    sent: 0,
    completedAt: null,
    createdAt: new Date(now.getTime() - 60_000),
    team: {
      id: TEAM,
      name: 'Acme',
      slug: 'acme',
      plan: 'FREE',
      statusPage: {
        enabled: true,
        subscriptions: true,
        title: 'Acme status',
        items: [{ monitorId: 'm1', label: 'Public API' }],
      },
    },
    notice: {
      id: 'n1',
      teamId: TEAM,
      kind: 'INCIDENT',
      title: 'Slow API',
      state: 'INVESTIGATING',
      monitorIds: ['m1'],
      startsAt: null,
      endsAt: null,
      resolvedAt: null,
      startNotifiedAt: null,
      createdById: null,
      createdAt: now,
      updatedAt: now,
      updates: [],
    },
    update: {
      id: 'u1',
      noticeId: 'n1',
      state: 'INVESTIGATING',
      body: 'Looking into it',
      createdById: null,
      createdAt: now,
    },
    ...extra,
  } as DispatchRow;
}

const flush = () => new Promise((resolve) => setImmediate(resolve));
const withTeam = (row: CloudStatusSubscriber) => ({
  ...row,
  team: { id: TEAM, name: 'Acme', slug: 'acme', plan: 'FREE' },
});

describe('CloudStatusSubscribersService', () => {
  let repository: Record<string, ReturnType<typeof vi.fn>>;
  let sent: MailMessage[];
  let service: CloudStatusSubscribersService;

  beforeEach(() => {
    sent = [];
    repository = {
      signupPage: vi.fn().mockResolvedValue(page()),
      countCapped: vi.fn().mockResolvedValue(0),
      find: vi.fn().mockResolvedValue(null),
      confirmationsSince: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue(subscriber('new', { status: 'PENDING' })),
      update: vi.fn().mockResolvedValue(subscriber('s1')),
      findByConfirmHash: vi.fn().mockResolvedValue(null),
      findByUnsubscribeToken: vi.fn().mockResolvedValue(null),
      startedMaintenance: vi.fn().mockResolvedValue([]),
      claimMaintenanceStart: vi.fn().mockResolvedValue(true),
      openDispatches: vi.fn().mockResolvedValue([]),
      reserveEmails: vi.fn(
        (_team: string, want: number) => Promise.resolve(want) as Promise<number>,
      ),
      releaseEmails: vi.fn().mockResolvedValue(undefined),
      nextBatch: vi.fn().mockResolvedValue([]),
      claimBatch: vi.fn().mockResolvedValue(true),
      complete: vi.fn().mockResolvedValue(undefined),
    };
    const mail = {
      send: vi.fn((message: MailMessage) => {
        sent.push(message);
        return Promise.resolve();
      }),
    } as unknown as MailService;
    const config = {
      isTest: true,
      cloudUrl: 'https://cloud.codeqlick.com',
      siteUrl: 'https://codeqlick.com',
      publicApiUrl: 'https://api.codeqlick.com/v1',
    } as unknown as AppConfigService;
    service = new CloudStatusSubscribersService(
      repository as unknown as CloudStatusSubscribersRepository,
      {} as CloudTeamsService,
      { forgetStatus: vi.fn() } as unknown as CloudMonitorsService,
      mail,
      config,
    );
  });

  const input = { email: 'Ada@Example.com', locale: 'es' as const, acceptPrivacy: true as const };
  describe('subscribe', () => {
    it('creates a pending row and emails a confirmation link in the page language', async () => {
      await service.subscribe('acme', input, now);
      await flush();
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          teamId: TEAM,
          email: 'ada@example.com',
          locale: 'ES',
          status: 'PENDING',
          confirmSentAt: now,
          confirmExpiresAt: new Date(now.getTime() + 48 * 3_600_000),
        }),
      );
      expect(sent).toHaveLength(1);
      expect(sent[0]!.to).toBe('ada@example.com');
      expect(sent[0]!.subject).toBe('Confirma tu suscripción a Acme status');
      const token = /confirm\?token=([\w-]+)/.exec(sent[0]!.text)![1]!;
      const stored = repository.create.mock.calls[0]![0] as { confirmTokenHash: string };
      expect(stored.confirmTokenHash).toBe(hashToken(token));
    });

    it('does nothing for the honeypot', async () => {
      await service.subscribe('acme', { ...input, website: 'spam' }, now);
      expect(repository.signupPage).not.toHaveBeenCalled();
      expect(sent).toHaveLength(0);
    });

    it('refuses when the page is disabled or subscriptions are off', async () => {
      repository.signupPage!.mockResolvedValueOnce(page({ subscriptions: false }));
      await expect(service.subscribe('acme', input, now)).rejects.toBeInstanceOf(NotFoundException);
      repository.signupPage!.mockResolvedValueOnce(page({ enabled: false }));
      await expect(service.subscribe('acme', input, now)).rejects.toBeInstanceOf(NotFoundException);
      repository.signupPage!.mockResolvedValueOnce(null);
      await expect(service.subscribe('acme', input, now)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses disposable addresses', async () => {
      await expect(
        service.subscribe('acme', { ...input, email: 'x@mailinator.com' }, now),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a new address at the plan cap, but lets a known one ask again', async () => {
      repository.countCapped!.mockResolvedValue(500);
      await expect(service.subscribe('acme', input, now)).rejects.toBeInstanceOf(ConflictException);
      repository.find!.mockResolvedValue(subscriber('s1', { status: 'UNSUBSCRIBED' }));
      await service.subscribe('acme', input, now);
      expect(repository.update).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({ status: 'PENDING' }),
      );
    });

    it('uses the PRO cap for a PRO team', async () => {
      repository.signupPage!.mockResolvedValue(
        page({ team: { id: TEAM, name: 'Acme', slug: 'acme', plan: 'PRO' } }),
      );
      repository.countCapped!.mockResolvedValue(4999);
      await service.subscribe('acme', input, now);
      expect(repository.create).toHaveBeenCalled();
      repository.countCapped!.mockResolvedValue(5000);
      await expect(service.subscribe('acme', input, now)).rejects.toBeInstanceOf(ConflictException);
    });

    it('sends nothing to an active address or past the per-address daily limit', async () => {
      repository.find!.mockResolvedValueOnce(subscriber('s1'));
      await service.subscribe('acme', input, now);
      repository.confirmationsSince!.mockResolvedValueOnce(5);
      await service.subscribe('acme', input, now);
      await flush();
      expect(sent).toHaveLength(0);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('limits sign-ups per team an hour', async () => {
      for (let i = 0; i < 60; i++) await service.subscribe('acme', input, now);
      await expect(service.subscribe('acme', input, now)).rejects.toBeInstanceOf(HttpException);
    });
  });

  describe('confirm and unsubscribe', () => {
    it('activates a valid token and refuses an expired one', async () => {
      repository.findByConfirmHash!.mockResolvedValueOnce(
        withTeam(
          subscriber('s1', { status: 'PENDING', confirmExpiresAt: new Date(now.getTime() + 1) }),
        ),
      );
      expect(await service.confirm('t', now)).toEqual({
        teamName: 'Acme',
        teamSlug: 'acme',
        locale: 'en',
      });
      expect(repository.update).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({ status: 'ACTIVE', confirmedAt: now, confirmTokenHash: null }),
      );
      repository.findByConfirmHash!.mockResolvedValueOnce(
        withTeam(subscriber('s1', { status: 'PENDING', confirmExpiresAt: now })),
      );
      await expect(service.confirm('t', now)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('unsubscribes once and stays idempotent; an unknown token is a 404', async () => {
      repository.findByUnsubscribeToken!.mockResolvedValueOnce(withTeam(subscriber('s1')));
      await service.unsubscribe('unsub-s1', now);
      expect(repository.update).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({ status: 'UNSUBSCRIBED', unsubscribedAt: now }),
      );
      repository.update!.mockClear();
      repository.findByUnsubscribeToken!.mockResolvedValueOnce(
        withTeam(subscriber('s1', { status: 'UNSUBSCRIBED' })),
      );
      await service.unsubscribe('unsub-s1', now);
      expect(repository.update).not.toHaveBeenCalled();
      await expect(service.unsubscribe('nope', now)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('the sending job', () => {
    it('claims each batch before sending, with one-click unsubscribe headers', async () => {
      repository.openDispatches!.mockResolvedValue([dispatch()]);
      repository
        .nextBatch!.mockResolvedValueOnce([subscriber('a'), subscriber('b', { locale: 'ES' })])
        .mockResolvedValueOnce([]);
      const order: string[] = [];
      repository.claimBatch!.mockImplementation(() => {
        order.push('claim');
        return Promise.resolve(true);
      });
      await service.tick(now);
      expect(repository.claimBatch).toHaveBeenCalledWith('d1', null, 'b', 2);
      expect(order).toEqual(['claim']);
      expect(sent.map((m) => m.to)).toEqual(['a@example.com', 'b@example.com']);
      expect(sent[0]!.subject).toBe('[Acme status] Incident: Slow API');
      expect(sent[1]!.subject).toBe('[Acme status] Incidencia: Slow API');
      expect(sent[0]!.listUnsubscribe).toBe(
        'https://api.codeqlick.com/v1/cloud/status-subscribers/unsubscribe/unsub-a',
      );
      expect(sent[0]!.text).toContain('Looking into it');
      expect(sent[0]!.text).toContain('Public API');
      expect(repository.complete).toHaveBeenCalledWith('d1', now);
    });

    it('sends nothing when another process claimed the batch', async () => {
      repository.openDispatches!.mockResolvedValue([dispatch()]);
      repository.nextBatch!.mockResolvedValue([subscriber('a')]);
      repository.claimBatch!.mockResolvedValue(false);
      await service.tick(now);
      expect(sent).toHaveLength(0);
      expect(repository.releaseEmails).toHaveBeenCalledWith(TEAM, 1);
    });

    it('cuts the batch to the hour left and waits for the next window', async () => {
      repository.openDispatches!.mockResolvedValue([dispatch()]);
      repository.nextBatch!.mockResolvedValue([subscriber('a'), subscriber('b'), subscriber('c')]);
      repository.reserveEmails!.mockResolvedValueOnce(2);
      await service.tick(now);
      expect(repository.reserveEmails).toHaveBeenCalledWith(TEAM, 3, 1000, now);
      expect(sent.map((m) => m.to)).toEqual(['a@example.com', 'b@example.com']);
      expect(repository.claimBatch).toHaveBeenCalledWith('d1', null, 'b', 2);
      expect(repository.complete).not.toHaveBeenCalled();
    });

    it('waits when the hour has no room', async () => {
      repository.openDispatches!.mockResolvedValue([dispatch()]);
      repository.nextBatch!.mockResolvedValue([subscriber('a')]);
      repository.reserveEmails!.mockResolvedValue(0);
      await service.tick(now);
      expect(sent).toHaveLength(0);
      expect(repository.claimBatch).not.toHaveBeenCalled();
      expect(repository.complete).not.toHaveBeenCalled();
    });

    it('drops stale dispatches and those of a page switched off, sending nothing', async () => {
      const off = dispatch({ id: 'off' });
      off.team.statusPage!.subscriptions = false;
      const stale = dispatch({ id: 'stale', createdAt: new Date(now.getTime() - 25 * 3_600_000) });
      repository.openDispatches!.mockResolvedValue([off, stale]);
      repository.nextBatch!.mockResolvedValue([subscriber('a')]);
      await service.tick(now);
      expect(sent).toHaveLength(0);
      expect(repository.complete).toHaveBeenCalledWith('off', now);
      expect(repository.complete).toHaveBeenCalledWith('stale', now);
    });

    it('claims started maintenance windows', async () => {
      repository.startedMaintenance!.mockResolvedValue([{ id: 'n2', teamId: TEAM }]);
      await service.tick(now);
      expect(repository.claimMaintenanceStart).toHaveBeenCalledWith(
        { id: 'n2', teamId: TEAM },
        now,
      );
    });

    it('keeps going when one email fails', async () => {
      repository.openDispatches!.mockResolvedValue([dispatch()]);
      repository
        .nextBatch!.mockResolvedValueOnce([subscriber('a'), subscriber('b')])
        .mockResolvedValueOnce([]);
      const mail = (service as unknown as { mail: { send: ReturnType<typeof vi.fn> } }).mail;
      mail.send.mockRejectedValueOnce(new Error('smtp down'));
      await service.tick(now);
      expect(sent.map((m) => m.to)).toEqual(['b@example.com']);
    });
  });
});
